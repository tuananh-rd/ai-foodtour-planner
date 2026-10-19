'use client';

import React, { useState } from 'react';
import '../ui/tokens.css';
import {
  Button,
  Chip,
  Card,
  Banner,
  BannerQueue,
  StatusQueueProvider,
  useStatusQueue,
  Sheet,
  Skeleton,
  EvidenceChip,
  Toast,
} from '../ui/index.js';

function GalleryInner() {
  const [theme, setTheme] = useState('light');
  const [selectedChips, setSelectedChips] = useState(['breakfast']);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [inputText, setInputText] = useState('Phố Cổ Hoàn Kiếm');
  const [inputSelect, setInputSelect] = useState('2');
  const [inputChecked, setInputChecked] = useState(false);

  const { enqueue, clear: clearQueue, queueCount } = useStatusQueue();

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }
  };

  const handleChipClick = (val) => {
    if (selectedChips.includes(val)) {
      setSelectedChips(selectedChips.filter((v) => v !== val));
    } else {
      setSelectedChips([...selectedChips, val]);
    }
  };

  return (
    <div
      className="ft-ui-kit-root"
      style={{
        backgroundColor: 'var(--bg, #FBF8F3)',
        color: 'var(--text, #1F1B16)',
        minHeight: '100vh',
        padding: '24px 16px 80px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 32,
            borderBottom: '1px solid var(--border, #DFD5C6)',
            paddingBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'var(--type-24, 24px)',
                fontWeight: 700,
                margin: '0 0 6px',
                color: 'var(--text, #1F1B16)',
              }}
            >
              Thư viện Giao diện UI V2
            </h1>
            <p
              style={{
                fontSize: 'var(--type-14, 14px)',
                color: 'var(--muted, #6B6259)',
                margin: 0,
              }}
            >
              Bộ thành phần chuẩn khả năng tiếp cận và bảng token thiết kế ẩm thực Hà Nội
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="secondary"
              onClick={toggleTheme}
              data-testid="toggle-dark-mode"
              aria-label="Chuyển chế độ màu sáng hoặc tối"
            >
              {theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
            </Button>
          </div>
        </header>

        {/* Section 1: Color Tokens & Contrast Check Elements */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-tokens">
          <h2
            id="sec-tokens"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            1. Bảng màu và Độ tương phản
          </h2>
          <Card elevated={false}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {/* Text tokens with backgrounds for contrast calculation */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--bg, #FBF8F3)',
                  border: '1px solid var(--border, #DFD5C6)',
                }}
              >
                <div style={{ fontSize: 'var(--type-12, 12px)', color: 'var(--muted, #6B6259)', marginBottom: 6 }}>
                  Văn bản chính trên nền trang
                </div>
                <div
                  data-testid="token-text-main"
                  style={{
                    color: 'var(--text, #1F1B16)',
                    backgroundColor: 'var(--bg, #FBF8F3)',
                    fontSize: 'var(--type-16, 16px)',
                    fontWeight: 600,
                  }}
                >
                  Văn bản chính (--text)
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--bg, #FBF8F3)',
                  border: '1px solid var(--border, #DFD5C6)',
                }}
              >
                <div style={{ fontSize: 'var(--type-12, 12px)', color: 'var(--muted, #6B6259)', marginBottom: 6 }}>
                  Văn bản phụ trên nền trang
                </div>
                <div
                  data-testid="token-text-muted"
                  style={{
                    color: 'var(--muted, #6B6259)',
                    backgroundColor: 'var(--bg, #FBF8F3)',
                    fontSize: 'var(--type-14, 14px)',
                  }}
                >
                  Ghi chú nguồn dữ liệu (--muted)
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--bg, #FBF8F3)',
                  border: '1px solid var(--border, #DFD5C6)',
                }}
              >
                <div style={{ fontSize: 'var(--type-12, 12px)', color: 'var(--muted, #6B6259)', marginBottom: 6 }}>
                  Màu điểm nhấn trên nền trang
                </div>
                <div
                  data-testid="token-text-accent"
                  style={{
                    color: 'var(--accent, #C8431A)',
                    backgroundColor: 'var(--bg, #FBF8F3)',
                    fontSize: 'var(--type-16, 16px)',
                    fontWeight: 700,
                  }}
                >
                  Điểm nhấn thương hiệu (--accent)
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--accent, #C8431A)',
                  border: '1px solid var(--accent, #C8431A)',
                }}
              >
                <div style={{ fontSize: 'var(--type-12, 12px)', color: 'var(--accent-contrast, #FFFFFF)', opacity: 0.8, marginBottom: 6 }}>
                  Chữ tương phản trên nút chính
                </div>
                <div
                  data-testid="token-accent-btn"
                  style={{
                    color: 'var(--accent-contrast, #FFFFFF)',
                    backgroundColor: 'var(--accent, #C8431A)',
                    fontSize: 'var(--type-16, 16px)',
                    fontWeight: 700,
                  }}
                >
                  Nút hành động chính
                </div>
              </div>
            </div>

            {/* Evidence Tokens */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 10 }}>
                Ba trạng thái bằng chứng (luôn kèm biểu tượng + chữ + mô tả):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <span
                  data-testid="token-evidence-verified"
                  style={{
                    color: 'var(--evidence-verified-text, #195624)',
                    backgroundColor: 'var(--evidence-verified-bg, #EAF7EC)',
                    border: '1px solid var(--evidence-verified-border, #9ED4A7)',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    fontWeight: 600,
                  }}
                >
                  Đã xác minh (Verified)
                </span>
                <span
                  data-testid="token-evidence-estimate"
                  style={{
                    color: 'var(--evidence-estimate-text, #6E4300)',
                    backgroundColor: 'var(--evidence-estimate-bg, #FFF6E0)',
                    border: '1px solid var(--evidence-estimate-border, #FFD480)',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    fontWeight: 600,
                  }}
                >
                  ≈ Ước tính (Estimate)
                </span>
                <span
                  data-testid="token-evidence-unknown"
                  style={{
                    color: 'var(--evidence-unknown-text, #413C36)',
                    backgroundColor: 'var(--evidence-unknown-bg, #EFECE6)',
                    border: '1px solid var(--evidence-unknown-border, #C8C1B7)',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    fontWeight: 600,
                  }}
                >
                  ? Chưa rõ (Unknown)
                </span>
              </div>
            </div>

            {/* Tabular numbers */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border, #DFD5C6)' }}>
              <div style={{ fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 6 }}>
                Định dạng số theo cột (tabular-nums):
              </div>
              <div
                className="tabular-nums"
                data-testid="tabular-numbers-demo"
                style={{ fontSize: 'var(--type-16, 16px)', color: 'var(--text, #1F1B16)' }}
              >
                125.000 ₫ · 3 quán ăn · ~27 phút đi bộ
              </div>
            </div>
          </Card>
        </section>

        {/* Section 2: Buttons */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-buttons">
          <h2
            id="sec-buttons"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            2. Nút bấm (Chiều cao tối thiểu ≥ 44px)
          </h2>
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
              <Button
                variant="primary"
                data-testid="btn-primary"
                onClick={() => setToastMessage('Đã nhấn nút chính!')}
              >
                Lập hành trình
              </Button>

              <Button
                variant="secondary"
                data-testid="btn-secondary"
                onClick={() => setToastMessage('Đã nhấn nút phụ!')}
              >
                Chọn điểm khác
              </Button>

              <Button
                variant="ghost"
                data-testid="btn-ghost"
                onClick={() => setToastMessage('Đã nhấn nút tối giản!')}
              >
                Chi tiết
              </Button>

              <Button
                variant="primary"
                loading={true}
                data-testid="btn-loading"
              >
                Đang tìm quán
              </Button>

              <Button
                variant="secondary"
                disabled={true}
                data-testid="btn-disabled"
              >
                Đã bị khóa
              </Button>
            </div>
          </Card>
        </section>

        {/* Section 3: Chips */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-chips">
          <h2
            id="sec-chips"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            3. Thẻ lựa chọn (Chip với aria-pressed, cao ≥ 44px)
          </h2>
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Chip
                selected={selectedChips.includes('breakfast')}
                onClick={() => handleChipClick('breakfast')}
                data-testid="chip-multi-1"
              >
                Ăn sáng 2 giờ
              </Chip>

              <Chip
                selected={selectedChips.includes('streetfood')}
                onClick={() => handleChipClick('streetfood')}
                data-testid="chip-multi-2"
              >
                Ăn vặt chiều tối
              </Chip>

              <Chip
                selected={selectedChips.includes('family')}
                onClick={() => handleChipClick('family')}
                data-testid="chip-multi-3"
              >
                Đi gia đình
              </Chip>

              <Chip
                selected={selectedChips.includes('budget')}
                onClick={() => handleChipClick('budget')}
                data-testid="chip-multi-4"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                }
              >
                Dưới 100k/người
              </Chip>
            </div>
          </Card>
        </section>

        {/* Section 4: Banner & StatusQueue */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-banners">
          <h2
            id="sec-banners"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            4. Thông báo và Hàng đợi Trạng thái (Chỉ 1 thông báo hiển thị)
          </h2>
          <Card>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 'var(--type-14, 14px)', marginBottom: 10, color: 'var(--muted, #6B6259)' }}>
                Hàng đợi StatusQueue đảm bảo chỉ DUY NHẤT một thông báo được hiển thị tại một thời điểm theo thứ tự ưu tiên: <strong>Lỗi (Error) &gt; Cảnh báo (Warning) &gt; Thông tin (Info)</strong>. Tổng thông báo đang xếp hàng: {queueCount}.
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <Button
                  variant="primary"
                  data-testid="enqueue-error-btn"
                  onClick={() =>
                    enqueue({
                      id: 'demo_error',
                      type: 'error',
                      title: 'Lỗi máy chủ',
                      message: 'Không thể kết nối đến máy chủ định tuyến. Đang dùng ước tính nội bộ.',
                    })
                  }
                >
                  Thêm Lỗi (Ưu tiên cao nhất)
                </Button>

                <Button
                  variant="secondary"
                  data-testid="enqueue-warning-btn"
                  onClick={() =>
                    enqueue({
                      id: 'demo_warning',
                      type: 'warning',
                      title: 'Cảnh báo hạn mức',
                      message: 'Trợ lý AI sắp hết lượt hôm nay (còn 2/20 lượt). Hệ thống sẽ chuyển sang bộ luật.',
                    })
                  }
                >
                  Thêm Cảnh báo
                </Button>

                <Button
                  variant="secondary"
                  data-testid="enqueue-info-btn"
                  onClick={() =>
                    enqueue({
                      id: 'demo_info',
                      type: 'info',
                      title: 'Cập nhật',
                      message: 'Hành trình vừa được làm mới với 3 quán ăn phù hợp.',
                    })
                  }
                >
                  Thêm Thông tin
                </Button>

                <Button
                  variant="ghost"
                  data-testid="clear-queue-btn"
                  onClick={clearQueue}
                >
                  Xóa hàng đợi
                </Button>
              </div>
            </div>

            {/* Single active banner rendered here */}
            <div data-testid="ui-kit-banner-queue">
              <BannerQueue />
            </div>
          </Card>
        </section>

        {/* Section 5: Sheet */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-sheet">
          <h2
            id="sec-sheet"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            5. Bảng trượt (Sheet: đáy mobile &lt; 600px, bên phải desktop ≥ 1024px)
          </h2>
          <Card>
            <p style={{ fontSize: 'var(--type-14, 14px)', color: 'var(--muted, #6B6259)', marginBottom: 14 }}>
              Hỗ trợ bẫy tiêu điểm bàn phím (Focus Trap), phím Escape để đóng, khôi phục tiêu điểm khi đóng, và nền trơ (aria-modal).
            </p>
            <Button
              variant="primary"
              data-testid="open-sheet-btn"
              onClick={() => setIsSheetOpen(true)}
            >
              Mở Bảng Tùy chọn (Sheet)
            </Button>

            <Sheet
              isOpen={isSheetOpen}
              onClose={() => setIsSheetOpen(false)}
              title="Tùy chọn hành trình"
              data-testid="sheet-dialog"
              footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <Button
                    variant="secondary"
                    data-testid="sheet-cancel-btn"
                    onClick={() => setIsSheetOpen(false)}
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    variant="primary"
                    data-testid="sheet-save-btn"
                    onClick={() => {
                      setIsSheetOpen(false);
                      setToastMessage('Đã lưu tùy chọn hành trình thành công!');
                    }}
                  >
                    Lưu thay đổi
                  </Button>
                </div>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    htmlFor="sheet-input-origin"
                    style={{ display: 'block', fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 6 }}
                  >
                    Điểm xuất phát:
                  </label>
                  <input
                    id="sheet-input-origin"
                    type="text"
                    defaultValue="Hồ Hoàn Kiếm, Hà Nội"
                    data-testid="sheet-focusable-input"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: '1px solid var(--border, #DFD5C6)',
                      backgroundColor: 'var(--card-bg, #FFFFFF)',
                      color: 'var(--text, #1F1B16)',
                      fontSize: 'var(--type-14, 14px)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="sheet-input-duration"
                    style={{ display: 'block', fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 6 }}
                  >
                    Thời gian ăn uống:
                  </label>
                  <select
                    id="sheet-input-duration"
                    defaultValue="180"
                    style={{
                      width: '100%',
                      minHeight: 44,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: '1px solid var(--border, #DFD5C6)',
                      backgroundColor: 'var(--card-bg, #FFFFFF)',
                      color: 'var(--text, #1F1B16)',
                      fontSize: 'var(--type-14, 14px)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="120">2 giờ</option>
                    <option value="180">3 giờ</option>
                    <option value="240">4 giờ</option>
                  </select>
                </div>
              </div>
            </Sheet>
          </Card>
        </section>

        {/* Section 6: Evidence Chips */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-evidence">
          <h2
            id="sec-evidence"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            6. Huy hiệu bằng chứng (EvidenceChip)
          </h2>
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <EvidenceChip
                level="verified"
                data-testid="evidence-chip-verified"
              />
              <EvidenceChip
                level="estimate"
                data-testid="evidence-chip-estimate"
              />
              <EvidenceChip
                level="unknown"
                data-testid="evidence-chip-unknown"
              />
            </div>
          </Card>
        </section>

        {/* Section 7: Form Inputs (Min height >= 44px) */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-inputs">
          <h2
            id="sec-inputs"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            7. Ô nhập liệu biểu mẫu (Chiều cao tối thiểu ≥ 44px)
          </h2>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              <div>
                <label
                  htmlFor="input-search"
                  style={{ display: 'block', fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 6 }}
                >
                  Tìm quán hoặc món ăn:
                </label>
                <input
                  id="input-search"
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  data-testid="ui-kit-input-text"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border, #DFD5C6)',
                    backgroundColor: 'var(--card-bg, #FFFFFF)',
                    color: 'var(--text, #1F1B16)',
                    fontSize: 'var(--type-14, 14px)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="input-stops"
                  style={{ display: 'block', fontSize: 'var(--type-14, 14px)', fontWeight: 600, marginBottom: 6 }}
                >
                  Số điểm dừng dự kiến:
                </label>
                <select
                  id="input-stops"
                  value={inputSelect}
                  onChange={(e) => setInputSelect(e.target.value)}
                  data-testid="ui-kit-input-select"
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border, #DFD5C6)',
                    backgroundColor: 'var(--card-bg, #FFFFFF)',
                    color: 'var(--text, #1F1B16)',
                    fontSize: 'var(--type-14, 14px)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="2">2 điểm dừng</option>
                  <option value="3">3 điểm dừng (khuyến nghị)</option>
                  <option value="4">4 điểm dừng</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <label
                  data-testid="ui-kit-input-checkbox"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    fontSize: 'var(--type-14, 14px)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={inputChecked}
                    onChange={(e) => setInputChecked(e.target.checked)}
                    style={{ width: 44, height: 44, minWidth: 44, minHeight: 44, cursor: 'pointer', margin: 0 }}
                  />
                  <span>Ưu tiên quán mở cửa buổi sáng</span>
                </label>
              </div>
            </div>
          </Card>
        </section>

        {/* Section 8: Skeleton */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-skeleton">
          <h2
            id="sec-skeleton"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            8. Khung tải dữ liệu (Skeleton)
          </h2>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton variant="circle" height={44} width={44} data-testid="skeleton-circle" />
                <div style={{ flex: 1 }}>
                  <Skeleton variant="text" height={16} width="60%" style={{ marginBottom: 6 }} data-testid="skeleton-text" />
                  <Skeleton variant="text" height={12} width="40%" />
                </div>
              </div>
              <Skeleton variant="rect" height={60} data-testid="skeleton-rect" />
            </div>
          </Card>
        </section>

        {/* Toast trigger */}
        <section style={{ marginBottom: 40 }} aria-labelledby="sec-toast">
          <h2
            id="sec-toast"
            style={{
              fontSize: 'var(--type-20, 20px)',
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text, #1F1B16)',
            }}
          >
            9. Thông báo nổi (Toast)
          </h2>
          <Card>
            <Button
              variant="secondary"
              data-testid="trigger-toast-btn"
              onClick={() => setToastMessage('Hành trình đã được sao chép vào bộ nhớ tạm!')}
            >
              Hiện thông báo Toast
            </Button>
          </Card>
        </section>
      </div>

      {/* Toast rendering */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="info"
          data-testid="toast-notification"
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}

export default function UIKitGalleryClient() {
  return (
    <StatusQueueProvider>
      <GalleryInner />
    </StatusQueueProvider>
  );
}
