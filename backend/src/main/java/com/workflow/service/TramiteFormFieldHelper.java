package com.workflow.service;

import com.workflow.model.FormDefinition;
import com.workflow.model.WorkflowNodo;
import com.workflow.model.WorkflowTransition;
import com.workflow.repository.FormDefinitionRepository;
import com.workflow.repository.WorkflowNodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class TramiteFormFieldHelper {

    private final FormDefinitionRepository formRepo;
    private final WorkflowNodoRepository nodoRepo;

    // ── Pass-through node detection ──────────────────────────────────────────

    static boolean isPassThroughType(String nodeType) {
        if (nodeType == null) return false;
        return switch (nodeType.toLowerCase()) {
            case "decision", "iteracion", "bifurcasion", "union" -> true;
            default -> false;
        };
    }

    // ── Form definition serialization ─────────────────────────────────────────

    Map<String, Object> toFormDefinitionPayload(FormDefinition formDefinition) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", formDefinition.getId());
        payload.put("nodoId", formDefinition.getNodoId());
        payload.put("title", formDefinition.getTitle());
        payload.put("fields", formDefinition.getFields() == null ? List.of() : formDefinition.getFields().stream()
                .map(field -> {
                    Map<String, Object> mapped = new LinkedHashMap<>();
                    mapped.put("id", field.getId());
                    mapped.put("name", field.getName());
                    mapped.put("type", field.getType() != null ? field.getType().name() : "TEXT");
                    mapped.put("isRequired", field.isRequired());
                    mapped.put("order", field.getOrder());
                    mapped.put("columns", field.getColumns() == null ? List.of() : field.getColumns().stream()
                            .map(column -> {
                                Map<String, Object> mappedColumn = new LinkedHashMap<>();
                                mappedColumn.put("id", column.getId());
                                mappedColumn.put("name", column.getName());
                                mappedColumn.put("type", column.getType() != null ? column.getType().name() : "TEXT");
                                mappedColumn.put("order", column.getOrder());
                                return mappedColumn;
                            })
                            .toList());
                    return mapped;
                })
                .toList());
        return payload;
    }

    // ── Incoming data / field forwarding ─────────────────────────────────────

    List<Map<String, Object>> buildSharedFields(WorkflowNodo sourceNodo, WorkflowTransition transition,
                                                Map<String, Object> tramiteData,
                                                List<WorkflowTransition> transitions, Set<String> visitedNodoIds) {
        List<FormDefinition.FormField> sourceFields = getForwardableFields(sourceNodo, transitions, visitedNodoIds);
        Map<String, Object> forwardConfig = transition.getForwardConfig();
        String mode = resolveForwardMode(forwardConfig);
        Set<String> selectedFieldNames = resolveSelectedFields(forwardConfig);
        boolean includeFiles = resolveIncludeFiles(forwardConfig);

        return sourceFields.stream()
                .filter(field -> shouldIncludeField(field, mode, selectedFieldNames, includeFiles))
                .map(field -> {
                    Object value = tramiteData.get(field.getName());
                    if (!hasMeaningfulValue(value)) return null;
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("label", field.getName());
                    map.put("name", field.getName());
                    map.put("type", field.getType());
                    map.put("columns", field.getColumns());
                    map.put("value", value);
                    return map;
                })
                .filter(Objects::nonNull)
                .toList();
    }

    List<FormDefinition.FormField> getForwardableFields(WorkflowNodo nodo, List<WorkflowTransition> transitions, Set<String> visitedNodoIds) {
        if (nodo == null || nodo.getId() == null || !visitedNodoIds.add(nodo.getId())) return List.of();
        if (!isPassThroughType(nodo.getNodeType())) {
            FormDefinition form = formRepo.findByNodoId(nodo.getId()).orElse(null);
            if (form == null || form.getFields() == null) return List.of();
            return dedupeFields(form.getFields());
        }
        List<FormDefinition.FormField> aggregated = new ArrayList<>();
        for (WorkflowTransition incoming : transitions) {
            if (!nodo.getId().equals(incoming.getToNodoId())) continue;
            WorkflowNodo upstreamNodo = nodoRepo.findById(incoming.getFromNodoId()).orElse(null);
            if (upstreamNodo == null) continue;
            aggregated.addAll(buildForwardedFieldDefinitions(upstreamNodo, incoming, transitions, new LinkedHashSet<>(visitedNodoIds)));
        }
        return dedupeFields(aggregated);
    }

    private List<FormDefinition.FormField> buildForwardedFieldDefinitions(WorkflowNodo sourceNodo, WorkflowTransition transition,
                                                                          List<WorkflowTransition> transitions, Set<String> visitedNodoIds) {
        List<FormDefinition.FormField> sourceFields = getForwardableFields(sourceNodo, transitions, visitedNodoIds);
        Map<String, Object> forwardConfig = transition.getForwardConfig();
        return sourceFields.stream()
                .filter(field -> shouldIncludeField(
                        field,
                        resolveForwardMode(forwardConfig),
                        resolveSelectedFields(forwardConfig),
                        resolveIncludeFiles(forwardConfig)
                ))
                .toList();
    }

    // ── Forward config resolution ─────────────────────────────────────────────

    String resolveForwardMode(Map<String, Object> forwardConfig) {
        if (forwardConfig == null) return "none";
        String mode = String.valueOf(forwardConfig.get("mode")).trim().toLowerCase();
        return switch (mode) {
            case "selected", "all", "files-only" -> mode;
            default -> "none";
        };
    }

    Set<String> resolveSelectedFields(Map<String, Object> forwardConfig) {
        Set<String> selected = new LinkedHashSet<>();
        if (forwardConfig != null && forwardConfig.get("fieldNames") instanceof List<?> fieldNames) {
            fieldNames.stream().map(String::valueOf).forEach(selected::add);
        }
        return selected;
    }

    boolean resolveIncludeFiles(Map<String, Object> forwardConfig) {
        if (forwardConfig == null) return false;
        Object includeFiles = forwardConfig.get("includeFiles");
        if (includeFiles instanceof Boolean value) {
            return value;
        }
        return "files-only".equals(resolveForwardMode(forwardConfig));
    }

    boolean shouldIncludeField(FormDefinition.FormField field, String mode, Set<String> selectedFieldNames, boolean includeFiles) {
        if (field == null) return false;
        boolean isFileField = FormDefinition.FieldType.FILE.equals(field.getType());
        if ("none".equalsIgnoreCase(mode)) return false;
        if ("files-only".equalsIgnoreCase(mode)) return isFileField;
        if ("all".equalsIgnoreCase(mode)) return includeFiles || !isFileField;
        if ("selected".equalsIgnoreCase(mode)) {
            return selectedFieldNames.contains(field.getName()) || (includeFiles && isFileField);
        }
        return false;
    }

    List<FormDefinition.FormField> dedupeFields(List<FormDefinition.FormField> fields) {
        Map<String, FormDefinition.FormField> deduped = new LinkedHashMap<>();
        for (FormDefinition.FormField field : fields) {
            if (field == null || field.getName() == null || field.getName().isBlank()) continue;
            deduped.putIfAbsent(field.getName(), field);
        }
        return new ArrayList<>(deduped.values());
    }

    boolean hasMeaningfulValue(Object value) {
        if (value == null) return false;
        if (value instanceof CharSequence text) return !text.toString().isBlank();
        if (value instanceof List<?> list) return !list.isEmpty();
        if (value instanceof Map<?, ?> map) return !map.isEmpty();
        return true;
    }

    // ── Voice transcript parsing ──────────────────────────────────────────────

    Map<String, Object> normalizeAiVoiceResult(String transcript,
                                               Map<String, Object> currentFormData,
                                               Map<String, Object> aiResult) {
        Map<String, Object> mergedFormData = new LinkedHashMap<>();
        mergedFormData.putAll(currentFormData);

        Map<String, Object> fieldValues = extractObjectMap(aiResult.get("fieldValues"));
        mergedFormData.putAll(fieldValues);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("transcript", transcript);
        response.put("formData", mergedFormData);
        response.put("appliedFields", extractAppliedFields(aiResult.get("appliedFields"), fieldValues));
        response.put("warnings", extractStringList(aiResult.get("warnings")));
        return response;
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> extractObjectMap(Object rawValue) {
        if (!(rawValue instanceof Map<?, ?> rawMap)) {
            return Map.of();
        }
        Map<String, Object> mapped = new LinkedHashMap<>();
        rawMap.forEach((key, value) -> mapped.put(String.valueOf(key), value));
        return mapped;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractAppliedFields(Object rawValue, Map<String, Object> fieldValues) {
        if (rawValue instanceof List<?> rawList) {
            return rawList.stream()
                    .filter(Map.class::isInstance)
                    .map(item -> (Map<String, Object>) item)
                    .map(item -> {
                        Map<String, Object> mapped = new LinkedHashMap<>();
                        mapped.put("field", String.valueOf(item.getOrDefault("field", "")));
                        mapped.put("value", item.get("value"));
                        return mapped;
                    })
                    .filter(item -> !String.valueOf(item.get("field")).isBlank())
                    .toList();
        }
        return fieldValues.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> mapped = new LinkedHashMap<>();
                    mapped.put("field", entry.getKey());
                    mapped.put("value", entry.getValue());
                    return mapped;
                })
                .toList();
    }

    List<String> extractStringList(Object rawValue) {
        if (!(rawValue instanceof List<?> rawList)) {
            return List.of();
        }
        return rawList.stream()
                .map(String::valueOf)
                .filter(value -> !value.isBlank())
                .toList();
    }
}
