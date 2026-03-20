import React from 'react';
import { motion } from 'framer-motion';

export const Privacy: React.FC = () => {
  return (
    <div className="w-full min-h-screen flex flex-col items-center py-24 px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="max-w-3xl w-full space-y-8"
      >
        <h1 className="text-4xl md:text-5xl text-white font-light mb-4">Privacy Policy</h1>
        
        <p className="text-gray-400 text-sm">Last Updated: January 27, 2025</p>
        
        <p className="text-gray-300 leading-relaxed">
          This Privacy Policy describes how your personal information is collected, used, and shared when you use the YN mobile application ("the App").
        </p>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Information We Collect</h2>
          
          <h3 className="text-xl text-red-900 font-light">Information You Provide Directly</h3>
          <p className="text-gray-300 leading-relaxed">When you use the App, we collect the following information that you provide:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li><span className="text-white">Account Information:</span> Email address, name, and password when you create an account</li>
            <li><span className="text-white">Profile Information:</span> Your name and preferences set during onboarding (e.g., preferred character types, story settings)</li>
            <li><span className="text-white">User-Generated Content:</span> Story prompts, preferences, and customization choices you provide when creating audio stories (including character details, settings, locations, tropes, and other creative inputs)</li>
            <li><span className="text-white">Bookmarks:</span> Stories you choose to save to your library</li>
          </ul>

          <h3 className="text-xl text-red-900 font-light mt-6">Information Collected Automatically</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li><span className="text-white">Usage Data:</span> Information about how you interact with the App, including stories created, timestamps, and feature usage</li>
            <li><span className="text-white">Device Information:</span> Basic device identifiers necessary for authentication and app functionality</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">How We Use Your Information</h2>
          <p className="text-gray-300 leading-relaxed">We use the information we collect to:</p>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li><span className="text-white">Provide the Service:</span> Generate personalized audio stories based on your preferences and inputs</li>
            <li><span className="text-white">Maintain Your Account:</span> Authenticate your identity and manage your user profile</li>
            <li><span className="text-white">Store Your Content:</span> Save your generated stories, bookmarks, and preferences so you can access them across sessions</li>
            <li><span className="text-white">Improve the App:</span> Understand how users interact with the App to improve functionality and user experience</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Third-Party Services</h2>
          <p className="text-gray-300 leading-relaxed">To provide our services, we share certain data with the following third-party service providers:</p>
          
          <div className="space-y-6 mt-4">
            <div className="bg-white/5 p-4 rounded-lg">
              <h3 className="text-xl text-red-900 font-light">Firebase (Google)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 mt-2">
                <li><span className="text-white">Purpose:</span> User authentication, database storage, and file storage</li>
                <li><span className="text-white">Data Shared:</span> Email address, user ID, story metadata, and generated audio files</li>
                <li><span className="text-white">Privacy Policy:</span> <a href="https://firebase.google.com/support/privacy" className="text-red-900 hover:text-red-700 transition-colors">firebase.google.com/support/privacy</a></li>
              </ul>
            </div>

            <div className="bg-white/5 p-4 rounded-lg">
              <h3 className="text-xl text-red-900 font-light">xAI (Grok API)</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 mt-2">
                <li><span className="text-white">Purpose:</span> Story and dialogue generation</li>
                <li><span className="text-white">Data Shared:</span> Story prompts, user preferences, and creative inputs you provide for story generation</li>
                <li><span className="text-white">Privacy Policy:</span> <a href="https://x.ai/legal/privacy-policy" className="text-red-900 hover:text-red-700 transition-colors">x.ai/legal/privacy-policy</a></li>
              </ul>
            </div>

            <div className="bg-white/5 p-4 rounded-lg">
              <h3 className="text-xl text-red-900 font-light">ElevenLabs</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 mt-2">
                <li><span className="text-white">Purpose:</span> Text-to-speech audio generation</li>
                <li><span className="text-white">Data Shared:</span> Generated story transcripts for conversion to audio</li>
                <li><span className="text-white">Privacy Policy:</span> <a href="https://elevenlabs.io/privacy" className="text-red-900 hover:text-red-700 transition-colors">elevenlabs.io/privacy</a></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl md:text-3xl text-white font-light border-b border-red-900/50 pb-2">Data Retention</h2>
          <p className="text-gray-300 leading-relaxed">
            We retain your personal information and generated content for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting us.
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
            The App is not intended for use by children under the age of 18. We do not knowingly collect personal information from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
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
};
