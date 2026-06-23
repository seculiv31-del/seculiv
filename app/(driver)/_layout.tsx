import { RoleGate } from '@/src/components/RoleGate';

export default function DriverLayout() {
  return <RoleGate allowedRole="driver" />;
}
