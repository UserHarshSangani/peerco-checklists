import type { SalaryStructure } from "@/lib/team/salary";

export type StaffProfileRow = {
  staff_id: string;
  mobile: string | null;
  gender: "male" | "female" | "other" | null;
  date_of_birth: string | null;
  joining_date: string | null;
  employment_status: "active" | "on_notice" | "exited" | "absconded";
  wage_type: "monthly" | "daily";
  is_part_timer_on_call: boolean;
  uan: string | null;
  esic_ip_number: string | null;
  pf_on_actual_wages: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  late_shift_consent: boolean;
  late_shift_consent_at: string | null;
  transport_note: string | null;
  login_enabled: boolean;
  auth_user_id: string | null;
};

export type JoiningItems = {
  documents_collected?: boolean;
  bank_details?: boolean;
  esic_registered?: boolean;
  pf_registered?: boolean;
  appointment_letter_signed?: boolean;
};

export type JoiningRow = {
  staff_id: string;
  items: JoiningItems;
  buddy_staff_id: string | null;
  day7_checkin_at: string | null;
  day7_note: string | null;
  day30_checkin_at: string | null;
  day30_note: string | null;
};

export type StaffRecord = {
  staff: { id: string; name: string; active: boolean; outlet_id: string };
  outletId: string;
  canSeePay: boolean;
  profile: StaffProfileRow | null;
  skills: string[];
  skillOptions: string[];
  salaries: SalaryStructure[];
  bank: { account_holder_name: string; account_last4: string; ifsc: string; updated_at: string } | null;
  joining: JoiningRow | null;
  colleagues: { id: string; name: string }[];
  documents: { id: string; kind: string; storage_path: string; note: string | null; created_at: string }[];
};
