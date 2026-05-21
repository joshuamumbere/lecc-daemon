export const LECC_PROTOCOL = 'lecc.v1';
export const DAEMON_VERSION = '0.1.0';
export const CAPABILITIES = [
  'logs',
  'cache_actions',
  'permissions',
  'permission_presets',
  'process_controls',
  'editable_port_map',
  'editable_services'
];

export function protocolPayload() {
  return {
    protocol: LECC_PROTOCOL,
    daemonVersion: DAEMON_VERSION,
    capabilities: CAPABILITIES
  };
}
