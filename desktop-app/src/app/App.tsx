import { HashRouter } from 'react-router-dom';
import AppErrorBoundary from './AppErrorBoundary';
import AppRoutes from './AppRoutes';

const App = () => {
  return (
    <AppErrorBoundary>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppErrorBoundary>
  );
};

export default App;
