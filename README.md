# HMS-

# Radhakrishna Hospital Management System (HMS)

A modern, fast, paperless Hospital Management System built with **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS**. Designed for outpatient clinic workflows, doctor consultation desks, pharmacy inventory & dispensing, and inpatient (IP) bed management.

---

## 🏥 System Modules & Workflows

1. **OPD Reception Desk (`/reception`)**
   - New patient registration with auto-generated Unique Hospital ID (UHID).
   - Daily sequential token generation (`#01`, `#02`, `#03`...) per doctor consultation cabin.
   - Live waiting queue and doctor cabin load monitoring.
   - Direct patient registration form at `/reception/register`.

2. **Doctor Consultation Desk (`/doctor` & `/doctor/prescribe`)**
   - Live patient queue filtered by consultant doctor.
   - Comprehensive digital prescription pad:
     - Chief complaints, clinical observations, and diagnosis.
     - Formulary search with dosage, frequency, food timing, and duration.
     - Doctor notes, follow-up scheduling, and injection orders.
     - Clean, professional A4 / prescription slip printing.

3. **Pharmacy & Inventory Module (`/pharmacy` & `/pharmacy/dispense`)**
   - Prescriptions routed directly to the pharmacy dispensing queue.
   - Real-time inventory deduction with batch number and expiry tracking.
   - Packaging calculator for tablets, sheets, and boxes (`/pharmacy/inventory/add`).
   - Compliance with Schedule H and Schedule H1 statutory drug registries.
   - Retail sales, receipt generation, and print slips.

4. **Inpatient (IP) Management (`/ip`)**
   - Ward and bed occupancy tracker (General wards, ICU, Deluxe rooms).
   - Admission records with standard 18-hour daily hospital stay calculation.
   - Discharge summaries and integrated billing.

5. **Administration & Security (`/admin`, `/login`, `/register`)**
   - Role-Based Access Control (RBAC): **Super Admin**, **Doctor**, **Receptionist**, **Pharmacist**.
   - Direct staff registration at `/register` with role-specific credentialing.
   - Pure credentials login at `/login`.
   - Comprehensive **Privacy Policy** (`/privacy-policy`) and **Terms & Conditions** (`/terms-and-conditions`).

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16 (Turbopack)](https://nextjs.org/)
- **UI Library**: [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Backend / Database**: Supabase SSR ready + LocalStorage offline-first resilience
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.18+ or v20+
- **pnpm**: `npm install -g pnpm`

### 2. Installation
```bash
git clone https://github.com/Mudasir-shariff/HMS-.git
cd HMS-
pnpm install
```

### 3. Environment Setup (Optional)
Copy the example environment configuration:
```bash
cp .env.local.example .env.local
```
Add your Supabase project URL and Anon key if connecting to a cloud database, or run completely offline with built-in resilient local storage.

### 4. Run Development Server
```bash
pnpm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production
```bash
pnpm run build
pnpm run start
```

---

## 📜 Compliance & Legal
- **Privacy Policy**: Adheres to Patient Health Information (PHI) confidentiality and DISHA guidelines.
- **Terms & Conditions**: Clinical accountability and Drugs & Cosmetics Act compliance.

---

## 📄 License
Private & Proprietary — Radhakrishna Hospital.
