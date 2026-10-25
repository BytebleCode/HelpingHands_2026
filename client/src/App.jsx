import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import { NudgeProvider } from './components/Nudge.jsx';
import { useSession } from './lib/session.jsx';
import Welcome from './pages/Welcome.jsx';
import Home from './pages/Home.jsx';
import Rewards from './pages/Rewards.jsx';
import Give from './pages/Give.jsx';
import Volunteer from './pages/Volunteer.jsx';
import Account from './pages/Account.jsx';
import Demo from './pages/Demo.jsx';

function RequireMember({ children }) {
  const { me, ready } = useSession();
  const location = useLocation();
  if (!ready) return null;
  if (!me) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      {/* NudgeProvider lets any page (Home, Demo) pop the moment-of-intent banner rendered by the Shell. */}
      <Route element={<RequireMember><NudgeProvider><Shell /></NudgeProvider></RequireMember>}>
        <Route index element={<Home />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="give" element={<Give />} />
        <Route path="volunteer" element={<Volunteer />} />
        <Route path="account" element={<Account />} />
        <Route path="demo" element={<Demo />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
