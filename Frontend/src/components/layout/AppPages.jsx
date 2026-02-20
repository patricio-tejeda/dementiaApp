import { NavLink } from "react-router-dom";

// TODO: create account page needs to be a page that only shows up at log in as a create new account option
const pages = [
  {
    id: "home",
    title: "Home",
    route: "/",
  },
  {
    id: "create-account",
    title: "Create An Account",
    route: "/create-account",
  },
    {
    id: "update-account",
    title: "Update Account Info",
    route: "/update-account",
  },
];

export default function AppPages() {
  const listPages = pages.map((page) => (
    <li className="hover:text-blue-500 cursor-pointer" key={page.id}>
      <NavLink
        to={page.route}
        className="hover:text-blue-500 cursor-pointer block p-2 rounded"
      >
        {page.title}
      </NavLink>
    </li>
  ));

  return <ul>{listPages}</ul>;
}
