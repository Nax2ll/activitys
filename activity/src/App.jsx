import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import DicePage from './pages/DicePage.jsx';
import MinesPage from './pages/MinesPage.jsx';
import PlinkoPage from './pages/PlinkoPage.jsx';
import DragonTowerPage from './pages/DragonTowerPage.jsx';
import KenoPage from './pages/KenoPage.jsx';
// أضف السطر هذا
import ChickenCrossPage from './pages/ChickenCrossPage.jsx'; 
import SlotsPage from './pages/SlotsPage.jsx'; 
import GuessPage from './pages/GuessPage.jsx'; 
import MemoryPage from './pages/MemoryPage.jsx'; 
import CamelRacingPage from './pages/CamelRacingPage.jsx'; 
import GuessWhoPage from './pages/GuessWhoPage.jsx'; 


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dice" element={<DicePage />} />
      <Route path="/mines" element={<MinesPage />} />
      <Route path="/plinko" element={<PlinkoPage />} />
      <Route path="/dragon-tower" element={<DragonTowerPage />} />
      <Route path="/keno" element={<KenoPage />} />
      {/* أضف السطر هذا للعبة الجديدة */}
      <Route path="/chicken-cross" element={<ChickenCrossPage />} />
      <Route path="/slots-machine" element={<SlotsPage />} />
      <Route path="/guess" element={<GuessPage />} />
      <Route path="/memory" element={<MemoryPage />} />
      <Route path="/camel-racing" element={<CamelRacingPage />} />
      <Route path="/guess-who" element={<GuessWhoPage />} />

    </Routes>
  );
}
