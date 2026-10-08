export const ONBOARDING_VERSION = 1;

export type OnboardingState = {
  is_existing_at_rollout: boolean;
  welcome_version: number;
};

export function shouldAutoOpenWelcome(
  state: OnboardingState | null,
  version = ONBOARDING_VERSION,
) {
  if (!state) return true;

  return !state.is_existing_at_rollout && state.welcome_version < version;
}
