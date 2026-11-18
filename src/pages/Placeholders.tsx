import { Camera, Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const ExplorePage = () => <EmptyState icon={<Compass size={40} />} title="สำรวจสถานที่" text="ค้นหาสถานที่ทั่วประเทศ จะมาภายหลัง — ตอนนี้เลือกจากหน้าจังหวัดได้เลย" />;
export const MemoriesPage = () => <EmptyState icon={<Camera size={40} />} title="ยังไม่มีความทรงจำ" text="จะมาใน Part 4.5" />;
