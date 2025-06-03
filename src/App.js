import logo from './logo.svg';
import './App.css';
import PriceDashboard from './components/PriceDashboard';
import PriceChart from './components/PriceChart';

function App() {
  return (
    <div className="App">
      <PriceChart />
      <PriceDashboard />
    </div>
  );
}

export default App;
