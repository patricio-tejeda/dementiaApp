import AppPages from "./AppPages";
export default function Layout({ children }) {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="h-full w-[15vw] bg-zinc-800 shadow-md p-4 text-center absolute inset-y-0 left-0">
        <h3 className="text-lg font-bold mb-4">Menu</h3>
        <AppPages />
      </aside>
      {/* Page Content */}
      <div className="flex-1 flex flex-col">
        {/* Content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
