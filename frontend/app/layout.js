import './globals.css';

export const metadata = {
  title: 'AI FoodTour Planner · Hà Nội',
  description: 'Trợ lý lập kế hoạch FoodTour ẩm thực Hà Nội theo thời gian thực với minh bạch dữ liệu.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function Layout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
