import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { About } from './components/About';
import { Home } from './components/Home';
import { Navbar } from './components/Navbar';
import { Privacy } from './components/Privacy';
import { Support } from './components/Support';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen w-full bg-black text-white font-['EB_Garamond'] selection:bg-red-900 selection:text-white overflow-x-hidden overflow-y-auto">
        <Navbar />
        
        <main className="w-full min-h-screen relative">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/support" element={<Support />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/thesynk" element={<TheSynk />} />
            <Route path="/thesynk/support" element={<TheSynkSupport />} />
            <Route path="/thesynk/privacy" element={<TheSynkPrivacy />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
