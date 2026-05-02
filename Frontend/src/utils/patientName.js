export function getPatientName(profile, user) {
  const patientName = profile?.fields?.find(
    (field) => (field.title || "").trim().toLowerCase() === "patient name"
  )?.answer;

  return (patientName || user?.full_name || user?.username || "").trim();
}

export function getPatientFirstName(profile, user) {
  const name = getPatientName(profile, user);
  return name ? name.split(/\s+/)[0] : "";
}
