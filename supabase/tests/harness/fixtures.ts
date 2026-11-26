import type { Db } from "./db";

// Fixed ids so test failures are readable.
export const ID = {
  orgA: "a0000000-0000-0000-0000-000000000001",
  orgB: "b0000000-0000-0000-0000-000000000001",
  outletA1: "a1000000-0000-0000-0000-000000000001",
  outletA2: "a2000000-0000-0000-0000-000000000001",
  outletB1: "b1000000-0000-0000-0000-000000000001",
  admin: "00000000-0000-0000-0000-0000000000ad",
  ownerA: "00000000-0000-0000-0000-00000000000a",
  managerA1: "00000000-0000-0000-0000-0000000000a1",
  deviceA1: "00000000-0000-0000-0000-0000000000d1",
  staffUserRishabh: "00000000-0000-0000-0000-000000000051",
  ownerB: "00000000-0000-0000-0000-00000000000b",
  rishabh: "51000000-0000-0000-0000-000000000001",
  rajeev: "52000000-0000-0000-0000-000000000001",
  bina: "5b000000-0000-0000-0000-000000000001", // outlet B1
} as const;

// Two organizations; A has two outlets. Runs as the superuser (bypasses RLS),
// the way a migration or the service role would.
export async function seedFixtures(db: Db): Promise<void> {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ID.admin}', 'admin@test.invalid'),
      ('${ID.ownerA}', 'owner-a@test.invalid'),
      ('${ID.managerA1}', 'manager-a1@test.invalid'),
      ('${ID.deviceA1}', 'device-a1@test.invalid'),
      ('${ID.staffUserRishabh}', 's-rishabh@staff.daybook.invalid'),
      ('${ID.ownerB}', 'owner-b@test.invalid');

    insert into public.organizations (id, name) values
      ('${ID.orgA}', 'Org A'), ('${ID.orgB}', 'Org B');
    insert into public.outlets (id, organization_id, name) values
      ('${ID.outletA1}', '${ID.orgA}', 'A1'),
      ('${ID.outletA2}', '${ID.orgA}', 'A2'),
      ('${ID.outletB1}', '${ID.orgB}', 'B1');

    insert into public.profiles (id, full_name, role, organization_id) values
      ('${ID.admin}', 'Admin', 'peerco_admin', null),
      ('${ID.ownerA}', 'Owner A', 'owner', '${ID.orgA}'),
      ('${ID.managerA1}', 'Manager A1', 'manager', '${ID.orgA}'),
      ('${ID.deviceA1}', 'Tablet A1', 'device', '${ID.orgA}'),
      ('${ID.staffUserRishabh}', 'Rishabh', 'staff', '${ID.orgA}'),
      ('${ID.ownerB}', 'Owner B', 'owner', '${ID.orgB}');
    insert into public.outlet_users (profile_id, outlet_id) values
      ('${ID.managerA1}', '${ID.outletA1}'),
      ('${ID.deviceA1}', '${ID.outletA1}');

    insert into public.staff (id, outlet_id, name, pin_hash) values
      ('${ID.rishabh}', '${ID.outletA1}', 'Rishabh', extensions.crypt('1234', extensions.gen_salt('bf'))),
      ('${ID.rajeev}', '${ID.outletA1}', 'Rajeev', extensions.crypt('2345', extensions.gen_salt('bf'))),
      ('${ID.bina}', '${ID.outletB1}', 'Bina', extensions.crypt('3456', extensions.gen_salt('bf')));

    insert into public.staff_profiles (staff_id, outlet_id, mobile, gender, joining_date, auth_user_id, login_enabled) values
      ('${ID.rishabh}', '${ID.outletA1}', '9876500001', 'male', '2026-06-01', '${ID.staffUserRishabh}', true),
      ('${ID.rajeev}', '${ID.outletA1}', '9876500002', 'male', '2026-08-15', null, false),
      ('${ID.bina}', '${ID.outletB1}', '9876500003', 'female', '2026-07-01', null, false);

    insert into public.salary_structures (staff_id, outlet_id, effective_from, wage_type, basic_paise, hra_paise) values
      ('${ID.rishabh}', '${ID.outletA1}', '2026-06-01', 'monthly', 1400000, 300000),
      ('${ID.rajeev}', '${ID.outletA1}', '2026-08-15', 'monthly', 1500000, 300000),
      ('${ID.bina}', '${ID.outletB1}', '2026-07-01', 'monthly', 1300000, 200000);

    insert into public.staff_bank_accounts (staff_id, outlet_id, account_holder_name, account_number_enc, account_last4, ifsc) values
      ('${ID.rishabh}', '${ID.outletA1}', 'Rishabh', 'v1:ciphertext', '4321', 'HDFC0001234');

    insert into public.roster_entries (outlet_id, staff_id, business_date, segments, role_skill, source) values
      ('${ID.outletA1}', '${ID.rishabh}', '2026-11-26', '[{"start":"12:00","end":"21:00"}]', 'floor', 'seed'),
      ('${ID.outletA1}', '${ID.rajeev}', '2026-11-26', '[{"start":"14:00","end":"23:00"}]', 'floor', 'seed'),
      ('${ID.outletB1}', '${ID.bina}', '2026-11-26', '[{"start":"12:00","end":"21:00"}]', 'floor', 'seed');
  `);
}
