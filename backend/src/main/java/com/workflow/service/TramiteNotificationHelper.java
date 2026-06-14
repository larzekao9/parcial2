package com.workflow.service;

import com.workflow.model.FormDefinition;
import com.workflow.model.Tramite;
import com.workflow.model.WorkflowNodo;
import com.workflow.model.WorkflowTransition;
import com.workflow.repository.FormDefinitionRepository;
import com.workflow.repository.UserRepository;
import com.workflow.repository.WorkflowNodoRepository;
import com.workflow.repository.WorkflowTransitionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
@Slf4j
@RequiredArgsConstructor
public class TramiteNotificationHelper {

    private final UserRepository userRepository;
    private final FcmService fcmService;
    private final WorkflowNodoRepository nodoRepo;
    private final WorkflowTransitionRepository transitionRepo;
    private final FormDefinitionRepository formRepo;

    void sendStatusNotification(Tramite tramite, String title, String body) {
        String email = findEmailFromTramite(tramite);
        Set<String> notifiedUserIds = new LinkedHashSet<>();
        boolean sent = false;

        if (email != null && !email.isBlank()) {
            var userByEmail = userRepository.findByEmail(email).orElse(null);
            if (userByEmail == null) {
                log.debug("No se encontró usuario con email {} para notificación de trámite {}", email, tramite.getCode());
            } else if (userByEmail.getFcmToken() == null || userByEmail.getFcmToken().isBlank()) {
                log.debug("Usuario {} encontrado por email pero sin fcmToken para trámite {}", email, tramite.getCode());
            } else {
                fcmService.sendNotification(userByEmail.getFcmToken(), title, body);
                notifiedUserIds.add(userByEmail.getId());
                sent = true;
            }
        } else {
            log.debug("No se encontró email del primer proceso para trámite {}", tramite.getCode());
        }

        if (tramite.getRequestedById() != null && !tramite.getRequestedById().isBlank()) {
            userRepository.findById(tramite.getRequestedById()).ifPresent(user -> {
                if (!notifiedUserIds.contains(user.getId())
                        && user.getFcmToken() != null
                        && !user.getFcmToken().isBlank()) {
                    fcmService.sendNotification(user.getFcmToken(), title, body);
                }
            });
        }

        if (!sent) {
            log.debug("No se envió notificación push para trámite {}. Email detectado: {}, requestedById: {}",
                    tramite.getCode(), email, tramite.getRequestedById());
        }
    }

    String findEmailFromTramite(Tramite tramite) {
        List<WorkflowNodo> nodos = nodoRepo.findByWorkflowIdOrderByOrderAsc(tramite.getWorkflowId());
        WorkflowNodo nodoInicio = nodos.stream()
                .filter(s -> "inicio".equalsIgnoreCase(s.getNodeType()))
                .findFirst()
                .orElse(nodos.isEmpty() ? null : nodos.get(0));
        if (nodoInicio == null) return null;

        List<WorkflowTransition> transitions = transitionRepo.findByWorkflowIdOrderByCreatedAtAsc(tramite.getWorkflowId());
        WorkflowTransition transicionInicio = transitions.stream()
                .filter(t -> nodoInicio.getId().equals(t.getFromNodoId()))
                .findFirst().orElse(null);
        if (transicionInicio == null) return null;

        FormDefinition form = formRepo.findByNodoId(transicionInicio.getToNodoId()).orElse(null);
        if (form == null || form.getFields() == null) return null;

        FormDefinition.FormField emailField = form.getFields().stream()
                .filter(f -> FormDefinition.FieldType.EMAIL.equals(f.getType()))
                .findFirst().orElse(null);
        if (emailField == null) return null;

        if (tramite.getFormData() == null) return null;
        Object emailValue = tramite.getFormData().get(emailField.getName());
        return emailValue != null ? emailValue.toString() : null;
    }
}
