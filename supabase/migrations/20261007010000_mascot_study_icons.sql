-- Allow profiles to pick a MAC mascot as their study icon.
-- Legacy desk icons stay valid; the app maps them to a stable random mascot.
alter table public.profiles
drop constraint if exists profiles_study_icon_check;

alter table public.profiles
add constraint profiles_study_icon_check check (
  study_icon in (
    'flame-desk',
    'clock-desk',
    'lamp-desk',
    'spark-desk',
    'max-arms-up',
    'max-arms-up-happy',
    'max-arms-down',
    'max-angry',
    'max-angry-scheme',
    'min-arms-up',
    'min-arms-down',
    'min-wave',
    'min-angry',
    'min-sad',
    'min-artist',
    'min-volleyball'
  )
);
