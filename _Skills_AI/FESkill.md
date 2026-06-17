# FESkill — Anti-Slop Frontend Design Skill

> Source: https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill

Skill này giúp AI tạo giao diện frontend có "taste" — không generic, không nhàm chán.

---

## Triết lý cốt lõi

**Brief-first thinking**: Không code ngay. Mọi quyết định thiết kế đều đi qua brief, đối tượng người dùng, và 3 dials bên dưới.

**Nguyên tắc**: Không dùng default tự động. Mọi pattern đều phải được justify bởi brief.

---

## 3 Dials điều chỉnh

| Dial | Range | Ý nghĩa |
|------|-------|---------|
| **DESIGN_VARIANCE** | 1–10 | 1 = đối xứng, 10 = bất đối xứng |
| **MOTION_INTENSITY** | 1–10 | 1 = tĩnh, 10 = animation cinematic |
| **VISUAL_DENSITY** | 1–10 | 1 = thoáng/gallery, 10 = dày đặc |

**Default baseline:** `8 / 6 / 4`

Điều chỉnh theo tín hiệu từ brief:
- Minimalist → 5-6
- Playful → 9-10
- Public sector → 3-4

---

## Anti-Tells — Những gì KHÔNG được làm

Các pattern bị cấm trừ khi có lý do rõ ràng:

- **Em-dash (`—`)** — bị cấm hoàn toàn, thay bằng dấu phẩy, dấu chấm, hoặc xuống dòng
- **Inter làm font mặc định** — dùng Geist, Outfit, Cabinet Grotesk trước
- **3 feature cards đồng đều** — bắt buộc có sự đa dạng
- **Palette beige+brass cho hàng premium** — rotate qua các dự án
- **Serif không có ý đồ** — chỉ dùng cho editorial/luxury, tránh Fraunces, Instrument Serif
- **Div giả screenshot** — dùng ảnh thật, generation tool, hoặc bỏ hẳn
- **Label version trên hero** (V0.6, BETA) — chỉ cho launch brief thật
- **Locale strips, scroll cues, decoration text** — gần như luôn là slop
- **Eyebrow trên mọi section** — tối đa 1 eyebrow trên 3 sections

---

## Design System Map

Dùng package chính thức khi có:

| Ngữ cảnh | Thư viện |
|----------|----------|
| Microsoft enterprise | Fluent UI |
| Google Material feel | Material Web v3 |
| IBM B2B analytics | Carbon |
| GitHub devtools | Primer |
| UK public sector | GOV.UK Frontend |
| US public sector | USWDS |
| Modern SaaS (own code) | shadcn/ui |
| Accessible React base | Radix Themes |
| Tailwind-native indie | Tailwind v4 + utilities |

Cho aesthetics (glassmorphism, bento, brutalism) → build với native CSS + Tailwind + component library — ghi nhận là approximation.

---

## Quy tắc Typography

- Italic descenders: `leading-[1.1]` minimum + `pb-1` reserve
- Display headline: `text-4xl md:text-6xl tracking-tighter leading-none`
- Body: `text-base text-gray-600 leading-relaxed max-w-[65ch]`

---

## Layout — Quy tắc cứng

- **Hero vừa viewport**: headline ≤ 2 dòng, subtext ≤ 20 từ, CTA không cần scroll để thấy
- **Hero top padding**: max `pt-24`; nội dung không được lơ lửng giữa màn hình
- **Hero stack**: tối đa 4 text elements (eyebrow, headline, subtext, CTA)
- **Navigation**: 1 dòng ở desktop, height ≤ 80px
- **Bento grid**: số cells = số items (không có cell rỗng)
- **Zigzag layout**: tối đa 2 sections liên tiếp rồi đổi pattern
- **Marquee**: tối đa 1 cái trên toàn trang

---

## Màu sắc & Contrast

- 1 accent color cho toàn dự án, nhất quán qua tất cả sections
- 1 hệ thống border-radius (all-sharp, all-soft, hoặc all-pill)
- 1 theme cố định (light/dark/auto) cho toàn trang
- Button contrast: WCAG AA minimum (4.5:1); không trắng trên trắng; CTA không được wrap ở desktop

---

## Ảnh & Visuals

- Ưu tiên: generation tool → ảnh thật (Picsum-seed URLs) → explicit placeholder
- Logo "Trusted by": dùng SVG thật từ Simple Icons / devicon
- Không overlay pills/labels trên ảnh; không dùng photo caption làm decoration

---

## Motion (khi dial > 3)

- Animation phải có lý do: hierarchy, storytelling, feedback, hoặc state transition
- **Bị cấm**: `window.addEventListener('scroll')`, custom scroll progress trong React state
- **Được dùng**: Motion hooks (`useScroll`, `useMotionValue`), GSAP ScrollTrigger, IntersectionObserver, CSS scroll-driven animations
- Bắt buộc honor `prefers-reduced-motion` khi `MOTION_INTENSITY > 3`

---

## Pre-Flight Checklist — Bắt buộc trước khi ship

- [ ] Zero em-dashes trong toàn bộ output
- [ ] 1 theme, 1 accent, 1 radius system
- [ ] Button và form contrast WCAG AA minimum
- [ ] Hero vừa viewport; CTA thấy được không cần scroll
- [ ] Eyebrow count ≤ ceil(sectionCount / 3)
- [ ] Không zigzag quá 2 sections liên tiếp
- [ ] Không duplicate CTA intent trên cùng 1 trang
- [ ] Bento cell count = content count (không có cell rỗng)
- [ ] Ảnh thật; không dùng div giả screenshot
- [ ] Mobile collapse rõ ràng cho high-variance layout
- [ ] Motion đã claim = motion đã build (không để half-built)
- [ ] Dark mode đã test cả 2 mode
- [ ] `useEffect` cleanup functions đã có

**Nếu 1 box fail → output chưa hoàn chỉnh.**

---

## Stack Defaults

| | |
|---|---|
| **Framework** | React hoặc Next.js với Server Components (RSC) |
| **Styling** | Tailwind v4 (`@tailwindcss/postcss`, không dùng legacy plugin) |
| **Animation** | Motion (`motion/react`); GSAP cho scroll-hijack (trong leaf components) |
| **Fonts** | `next/font` hoặc self-hosted `@font-face` với `swap` |
| **Icons** | Phosphor, HugeIcons, Radix Icons, hoặc Tabler (1 family / project) |
| **State** | `useState`/`useReducer` local; Zustand/Jotai cho global; `useMotionValue` cho continuous values |

---

## Redesign Protocol

1. **Xác định mode**: greenfield, preserve (modernise), hay overhaul (visual mới, giữ content)
2. **Audit trước**: brand tokens, IA, patterns cần giữ/bỏ, SEO baseline
3. **Evolve từng bước**: typography → spacing → color → motion → hero recomposition → full replacement (dừng khi brief đã đủ)
4. **Giữ ngầm**: URL structure, nav labels, form field names, legal copy
