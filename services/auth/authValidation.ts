// Pure module: form validation for sign-up and sign-in.

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface ProfileEditInput {
  name: string;
  university: string;
  program: string;
  branch: string;
}

/** What the faculty edit form submits. The department and institution replace program and branch. */
export interface FacultyProfileEditInput {
  name: string;
  university: string;
  department: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export const NAME_MAX_LENGTH = 80;
export const ACADEMIC_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();

  return trimmed.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(trimmed);
}

function emailError(email: string): string | undefined {
  if (email.trim() === "") return "Email is required.";
  if (!isValidEmail(email)) return "Please enter a valid email address.";

  return undefined;
}

export function passwordError(password: string): string | undefined {
  if (password === "") return "Password is required.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include a letter and a number.";
  }

  return undefined;
}

export function hasErrors<T>(errors: FieldErrors<T>): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

export function validateSignUp(input: SignUpInput): FieldErrors<SignUpInput> {
  const errors: FieldErrors<SignUpInput> = {};
  const name = input.name.trim();

  if (name === "") errors.name = "Name is required.";
  else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const email = emailError(input.email);

  if (email) errors.email = email;

  const password = passwordError(input.password);

  if (password) errors.password = password;

  if (input.confirmPassword === "") errors.confirmPassword = "Please confirm your password.";
  else if (input.confirmPassword !== input.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

/**
 * Name is required; university, program and branch are optional (a student may leave any blank)
 * but limited in length.
 */
export function validateProfileEdit(input: ProfileEditInput): FieldErrors<ProfileEditInput> {
  const errors: FieldErrors<ProfileEditInput> = {};
  const name = input.name.trim();

  if (name === "") errors.name = "Name is required.";
  else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const academic: [keyof ProfileEditInput, string][] = [
    ["university", "University"],
    ["program", "Program"],
    ["branch", "Branch"],
  ];

  for (const [field, label] of academic) {
    if (input[field].trim().length > ACADEMIC_MAX_LENGTH) {
      errors[field] = `${label} must be ${ACADEMIC_MAX_LENGTH} characters or fewer.`;
    }
  }

  return errors;
}

/** True for the faculty form's input, which is the only one that carries a department. */
export function isFacultyProfileEdit(
  input: ProfileEditInput | FacultyProfileEditInput,
): input is FacultyProfileEditInput {
  return "department" in input;
}

/**
 * Name is required; department and institution (stored as `university`) are optional, so a faculty
 * member can leave either blank, but they are limited in length.
 */
export function validateFacultyProfileEdit(
  input: FacultyProfileEditInput,
): FieldErrors<FacultyProfileEditInput> {
  const errors: FieldErrors<FacultyProfileEditInput> = {};
  const name = input.name.trim();

  if (name === "") errors.name = "Name is required.";
  else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const academic: [keyof FacultyProfileEditInput, string][] = [
    ["department", "Department"],
    ["university", "Institution"],
  ];

  for (const [field, label] of academic) {
    if (input[field].trim().length > ACADEMIC_MAX_LENGTH) {
      errors[field] = `${label} must be ${ACADEMIC_MAX_LENGTH} characters or fewer.`;
    }
  }

  return errors;
}

/** Sign-in only checks presence and shape, so it never reveals the password policy. */
export function validateSignIn(input: SignInInput): FieldErrors<SignInInput> {
  const errors: FieldErrors<SignInInput> = {};
  const email = emailError(input.email);

  if (email) errors.email = email;

  if (input.password === "") errors.password = "Password is required.";

  return errors;
}
