export type CreatableRole = "owner" | "manager" | "device";

export type OutletOption = {
  id: string;
  name: string;
};

export type BrandRow = {
  id: string;
  name: string;
  outletCount: number;
  loginCount: number;
  outlets: OutletOption[];
};

export type CreateLoginResult = {
  ok: true;
  email: string;
  temporary_password: string;
  user_id: string;
};

export type CreateLoginError = {
  ok: false;
  reason: string;
  message?: string;
};
