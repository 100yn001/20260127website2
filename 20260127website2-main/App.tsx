import { motion } from 'framer-motion';
import React from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { About } from './components/About';
import { Home } from './components/Home';
import { Navbar } from './components/Navbar';
import { Privacy } from './components/Privacy';
import { Support } from './components/Support';

const TheSynk: React.FC = () => (
  <div className="w-full min-h-screen flex flex-col items-center justify-center p-8 max-w-3xl mx-auto">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="space-y-10 text-center flex flex-col items-center"
    >
      <img
        src="/synk-icon.png"
        alt="the synk app icon"
        className="w-32 h-32 rounded-[28px] shadow-lg shadow-white/10"
      />
      <h1 className="text-4xl md:text-5xl text-white font-light">the synk</h1>
      <p className="text-lg md:text-xl text-gray-400 font-light max-w-md">
        coming soon to the App Store
      </p>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="inline-block opacity-50 cursor-not-allowed"
        title="Available when the app is published"
      >
        <img
          src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
          alt="Download on the App Store"
          className="h-14"
        />
      </a>
      <div className="flex gap-8 pt-4">
        <Link
          to="/thesynk/support"
          className="text-lg text-gray-400 hover:text-white transition-colors duration-300 border-b border-red-900/50 pb-1"
        >
          support
        </Link>
        <Link
          to="/thesynk/privacy"
          className="text-lg text-gray-400 hover:text-white transition-colors duration-300 border-b border-red-900/50 pb-1"
        >
          privacy policy
        </Link>
      </div>
    </motion.div>
  </div>
);

const TheSynkSupport: React.FC = () => (
  <div className="w-full min-h-screen flex flex-col items-center justify-center p-8 max-w-3xl mx-auto">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="space-y-8 text-center"
    >
      <Link to="/thesynk" className="text-sm tracking-[0.3em] uppercase text-gray-500 hover:text-gray-300 transition-colors duration-300">
        &larr; the synk
      </Link>
      <h2 className="text-sm md:text-base tracking-[0.3em] uppercase text-red-900 mb-4 inline-block">
        support
      </h2>
      <p className="text-xl md:text-3xl text-white font-light">
        For support inquiries regarding the synk, please contact us at:
      </p>
      <a
        href="mailto:support@yourname.media"
        className="text-xl md:text-3xl text-white font-light hover:text-red-900 transition-colors duration-300"
      >
        support@yourname.media
      </a>
    </motion.div>
  </div>
);

const TheSynkPrivacy: React.FC = () => (
  <div className="w-full min-h-screen flex flex-col items-center py-24 px-8">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="max-w-3xl w-full space-y-8"
    >
      <Link to="/thesynk" className="text-sm tracking-[0.3em] uppercase text-gray-500 hover:text-gray-300 transition-colors duration-300">
        &larr; the synk
      </Link>
      <h1 className="text-4xl md:text-5xl text-white font-light mb-4">Privacy Policy — the synk</h1>
      <p className="text-gray-400 text-sm">Last Updated: April 3, 2026</p>
      <p className="text-gray-300 leading-relaxed">
        This Privacy Policy describes how your personal information is collected, used, and shared when you use the synk mobile application ("the App").
      </p>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Information We Collect</h2>
        <h3 className="text-xl text-red-900 font-light">Information You Provide Directly</h3>
        <p className="text-gray-300 leading-relaxed">When you use the App, we may collect the following information that you provide:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li><span className="text-white">Account Information:</span> Email address, name, and password when you create an account</li>
          <li><span className="text-white">User Content:</span> Any content you create, share, or interact with within the App</li>
        </ul>
        <h3 className="text-xl text-red-900 font-light mt-6">Information Collected Automatically</h3>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li><span className="text-white">Usage Data:</span> Information about how you interact with the App, including feature usage and timestamps</li>
          <li><span className="text-white">Device Information:</span> Basic device identifiers necessary for authentication and app functionality</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">How We Use Your Information</h2>
        <p className="text-gray-300 leading-relaxed">We use the information we collect to:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li><span className="text-white">Provide the Service:</span> Deliver the core functionality of the App</li>
          <li><span className="text-white">Maintain Your Account:</span> Authenticate your identity and manage your user profile</li>
          <li><span className="text-white">Improve the App:</span> Understand how users interact with the App to improve functionality and user experience</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Third-Party Services</h2>
        <p className="text-gray-300 leading-relaxed">To provide our services, we may share certain data with third-party service providers:</p>
        <div className="space-y-6 mt-4">
          <div className="bg-white/5 p-4 rounded-lg">
            <h3 className="text-xl text-red-900 font-light">Firebase (Google)</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 mt-2">
              <li><span className="text-white">Purpose:</span> User authentication, database storage, and file storage</li>
              <li><span className="text-white">Data Shared:</span> Email address, user ID, and app data</li>
              <li><span className="text-white">Privacy Policy:</span> <a href="https://firebase.google.com/support/privacy" className="text-red-900 hover:text-red-700 transition-colors">firebase.google.com/support/privacy</a></li>
            </ul>
          </div>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Data Retention</h2>
        <p className="text-gray-300 leading-relaxed">
          We retain your personal information and content for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Data Security</h2>
        <p className="text-gray-300 leading-relaxed">We implement appropriate technical and organizational measures to protect your personal information, including:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Secure authentication via Firebase Authentication</li>
          <li>Encrypted data transmission (HTTPS/TLS)</li>
          <li>Access controls on stored data</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Your Rights</h2>
        <p className="text-gray-300 leading-relaxed">Depending on your location, you may have the following rights regarding your personal data:</p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li><span className="text-white">Access:</span> Request a copy of the personal data we hold about you</li>
          <li><span className="text-white">Correction:</span> Request correction of inaccurate personal data</li>
          <li><span className="text-white">Deletion:</span> Request deletion of your personal data</li>
          <li><span className="text-white">Portability:</span> Request a copy of your data in a portable format</li>
        </ul>
        <p className="text-gray-300 leading-relaxed mt-4">To exercise any of these rights, please contact us using the information below.</p>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Children's Privacy</h2>
        <p className="text-gray-300 leading-relaxed">
          The App is not intended for use by children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Changes to This Privacy Policy</h2>
        <p className="text-gray-300 leading-relaxed">
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Contact Us</h2>
        <p className="text-gray-300 leading-relaxed">
          If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:
        </p>
        <p className="text-white">
          Email: <a href="mailto:contact@yourname.media" className="text-red-900 hover:text-red-700 transition-colors">contact@yourname.media</a>
        </p>
      </section>
    </motion.div>
  </div>
);

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
