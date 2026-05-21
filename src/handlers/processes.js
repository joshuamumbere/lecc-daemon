import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PROCESS_ACTIONS = {
  start_user_service: {
    label: 'Start Service',
    description: 'Starts an allow-listed systemd user service.',
    systemctlVerb: 'start'
  },
  stop_user_service: {
    label: 'Stop Service',
    description: 'Stops an allow-listed systemd user service.',
    systemctlVerb: 'stop'
  },
  restart_user_service: {
    label: 'Restart Service',
    description: 'Restarts an allow-listed systemd user service.',
    systemctlVerb: 'restart'
  }
};

const SERVICE_PATTERN = /^[a-zA-Z0-9_.@-]+\.service$/;

export function listProcessActions() {
  return Object.entries(PROCESS_ACTIONS).map(([id, action]) => ({
    id,
    label: action.label,
    description: action.description
  }));
}

export function loadAllowedServices(servicesPath) {
  try {
    const services = JSON.parse(readFileSync(resolve(servicesPath), 'utf8'));
    return normalizeServices(services);
  } catch {
    return {};
  }
}

export function listAllowedServices(services) {
  return Object.entries(services).map(([id, service]) => ({
    id,
    label: service.label
  }));
}

export function saveAllowedServices(servicesPath, services) {
  const validation = validateServices(services);
  if (!validation.ok) {
    return validation;
  }

  const resolvedPath = resolve(servicesPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(validation.services, null, 2)}\n`, { mode: 0o600 });

  return validation;
}

export function validateServices(services) {
  const errors = [];
  const normalized = {};

  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    return { ok: false, errors: ['Services must be an object'] };
  }

  Object.entries(services).forEach(([rawServiceId, rawService]) => {
    const serviceId = String(rawServiceId || '').trim();
    const label = String(rawService?.label || '').trim();

    if (!SERVICE_PATTERN.test(serviceId)) {
      errors.push(`${serviceId || '(blank)'}: service must be a valid .service unit name`);
      return;
    }

    if (!label) {
      errors.push(`${serviceId}: label is required`);
      return;
    }

    normalized[serviceId] = { label };
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, services: normalized };
}

export function runProcessAction(actionId, requestId, serviceId, services, sendUpdate) {
  const action = PROCESS_ACTIONS[actionId];
  const service = validateService(serviceId, services);

  if (!action) {
    sendFailure(sendUpdate, requestId, actionId, serviceId, 'Process action is not allow-listed');
    return null;
  }

  if (!service.ok) {
    sendFailure(sendUpdate, requestId, actionId, serviceId, service.error);
    return null;
  }

  const args = ['--user', action.systemctlVerb, service.serviceId];

  sendUpdate({
    type: 'process_action_started',
    requestId,
    actionId,
    serviceId: service.serviceId,
    label: `${action.label}: ${service.label}`,
    command: 'systemctl',
    args
  });

  const child = spawn('systemctl', args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    sendUpdate({
      type: 'process_action_output',
      requestId,
      actionId,
      serviceId: service.serviceId,
      stream: 'stdout',
      data: chunk.toString()
    });
  });

  child.stderr.on('data', (chunk) => {
    sendUpdate({
      type: 'process_action_output',
      requestId,
      actionId,
      serviceId: service.serviceId,
      stream: 'stderr',
      data: chunk.toString()
    });
  });

  child.on('error', (error) => {
    sendFailure(sendUpdate, requestId, actionId, service.serviceId, error.message, `${action.label}: ${service.label}`);
  });

  child.on('close', (code) => {
    sendUpdate({
      type: 'process_action_finished',
      requestId,
      actionId,
      serviceId: service.serviceId,
      label: `${action.label}: ${service.label}`,
      ok: code === 0,
      code
    });
  });

  return child;
}

function normalizeServices(services) {
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(services)
      .filter(([serviceId]) => SERVICE_PATTERN.test(serviceId))
      .map(([serviceId, service]) => [
        serviceId,
        {
          label: String(service?.label || serviceId).trim() || serviceId
        }
      ])
  );
}

export function validateService(rawServiceId, services) {
  const serviceId = String(rawServiceId || '').trim();

  if (!SERVICE_PATTERN.test(serviceId)) {
    return { ok: false, error: 'Service must be a valid .service unit name', serviceId };
  }

  if (!services[serviceId]) {
    return { ok: false, error: 'Service is not allow-listed', serviceId };
  }

  return {
    ok: true,
    serviceId,
    label: services[serviceId].label
  };
}

function sendFailure(sendUpdate, requestId, actionId, serviceId, error, label = '') {
  sendUpdate({
    type: 'process_action_failed',
    requestId,
    actionId,
    serviceId,
    label: label || actionId,
    ok: false,
    error
  });
}
