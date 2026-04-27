import InfoCategoryPage from "./InfoCategoryPage";

export default function PersonalInfoPage() {
  return (
    <InfoCategoryPage
      category="personal"
      title="Personal Information"
      subtitle="Details about the patient — birthplace, schools, occupation, favorites, and anything else worth remembering."
      addPlaceholder="e.g., Favorite movie, First car, Wedding date"
    />
  );
}