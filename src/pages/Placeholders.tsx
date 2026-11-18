import { Camera, Compass, Luggage } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const ExplorePage = () => <EmptyState icon={<Compass size={40} />} title="สำรวจสถานที่" text="จะมาใน Phase 4" />;
export const TripsPage = () => <EmptyState icon={<Luggage size={40} />} title="ยังไม่มีทริป" text="จะมาใน Phase 4" />;
export const MemoriesPage = () => <EmptyState icon={<Camera size={40} />} title="ยังไม่มีความทรงจำ" text="จะมาใน Phase 4" />;
