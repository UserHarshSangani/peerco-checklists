export type Outlet = {
  id: string;
  name: string;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
};

export type ChecklistItemRow = {
  id: string;
  label: string;
  required: boolean;
  position: number;
  requires_photo: boolean;
};

export type StaffMember = {
  id: string;
  name: string;
};
