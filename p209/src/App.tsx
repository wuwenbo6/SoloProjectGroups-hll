import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import ConnectionConfig from "@/pages/ConnectionConfig";
import SchemaBrowser from "@/pages/SchemaBrowser";
import AttributeCreator from "@/pages/AttributeCreator";
import SchemaDeploy from "@/pages/SchemaDeploy";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/connection" replace />} />
        <Route element={<Layout />}>
          <Route path="/connection" element={<ConnectionConfig />} />
          <Route path="/schema" element={<SchemaBrowser />} />
          <Route path="/attributes/new" element={<AttributeCreator />} />
          <Route path="/deploy" element={<SchemaDeploy />} />
        </Route>
      </Routes>
    </Router>
  );
}
