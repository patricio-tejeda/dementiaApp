import InfoCategoryPage from "./InfoCategoryPage";

export default function FamilyInfoPage() {
  return (
    <InfoCategoryPage
      category="family"
      title="Family Information"
      subtitle="Family members, relationships, and meaningful family details. For the Family Tree game, use specific titles like 'Maternal Grandmother', 'Paternal Grandfather', 'Brother John', or 'Daughter Sarah' so they appear in the right spot."
      addPlaceholder="e.g., Maternal Grandmother, Brother John, Daughter Sarah"
    />
  );
}