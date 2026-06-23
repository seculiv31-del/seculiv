import { RoleGate } from '@/src/components/RoleGate';

export default function ClientLayout() {
  return <RoleGate allowedRole="client" />;
}
