import { notFound } from 'next/navigation';
import UIKitGalleryClient from './UIKitGalleryClient.jsx';

export const metadata = {
  title: 'Thư viện thành phần UI Kit · AI FoodTour',
  description: 'Thư viện mẫu thiết kế và kiểm thử khả năng tiếp cận UI V2',
};

export default function UIKitPage() {
  // Only rendered when NEXT_PUBLIC_UI_KIT=1; returns 404 otherwise
  if (process.env.NEXT_PUBLIC_UI_KIT !== '1') {
    notFound();
  }

  return <UIKitGalleryClient />;
}
