import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MODULES_DESACTIVES } from './lib/modules';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/login/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ElevesListPage } from './pages/eleves/ElevesListPage';
import { EleveDetailPage } from './pages/eleves/EleveDetailPage';
import { CartesScolairesPage } from './pages/cartes/CartesScolairesPage';
import { ClassesListPage } from './pages/classes/ClassesListPage';
import { ClasseDetailPage } from './pages/classes/ClasseDetailPage';
import { NiveauxPage } from './pages/classes/NiveauxPage';
import { TarifsEcolagePage } from './pages/finances/TarifsEcolagePage';
import { ConfigurationPage } from './pages/configuration/ConfigurationPage';
import { FacturesListPage } from './pages/finances/FacturesListPage';
import { AppelDuJourPage } from './pages/absences/AppelDuJourPage';
import { AbsencesHistoriquePage } from './pages/absences/AbsencesHistoriquePage';
import { PersonnelListPage } from './pages/personnel/PersonnelListPage';
import { PersonnelFormPage } from './pages/personnel/PersonnelFormPage';
import { PersonnelDetailPage } from './pages/personnel/PersonnelDetailPage';
import { NotesPage } from './pages/notes/NotesPage';
import { MatieresPage } from './pages/notes/MatieresPage';
import { ParcoursPage } from './pages/parcours/ParcoursPage';
import { EmploiDuTempsPage } from './pages/emploi-du-temps/EmploiDuTempsPage';
import { CommunicationPage } from './pages/communication/CommunicationPage';
import { AdmissionsPage } from './pages/admissions/AdmissionsPage';
import { InscriptionPubliquePage } from './pages/admissions/InscriptionPubliquePage';
import { PaiePage } from './pages/paie/PaiePage';
import { LogistiquePage } from './pages/logistique/LogistiquePage';
import { FinancePage } from './pages/finance/FinancePage';
import { BordereauJournalierPage } from './pages/finance/BordereauJournalierPage';
import { BudgetTresoreriePage } from './pages/finance/BudgetTresoreriePage';
import { ClotureAnneePage } from './pages/finance/ClotureAnneePage';
import { AssurancePage } from './pages/finance/AssurancePage';
import { InscriptionsPage } from './pages/finances/InscriptionsPage';
import { PaiementEleveTypePage } from './pages/finances/PaiementEleveTypePage';
import { ImpayesTranchePage } from './pages/finances/ImpayesTranchePage';
import { BibliothequePage } from './pages/bibliotheque/BibliothequePage';
import { UtilisateursPage } from './pages/utilisateurs/UtilisateursPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inscription/:ecoleId" element={<InscriptionPubliquePage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/eleves" element={<ElevesListPage />} />
            <Route path="/eleves/nouveau" element={<AdmissionsPage ajoutSeul />} />
            <Route path="/eleves/:id" element={<EleveDetailPage />} />
            <Route path="/cartes-scolaires" element={<CartesScolairesPage />} />
            <Route path="/classes" element={<ClassesListPage />} />
            <Route path="/classes/:id" element={<ClasseDetailPage />} />
            <Route path="/niveaux" element={<NiveauxPage />} />
            <Route path="/configuration" element={<ConfigurationPage />} />
            <Route path="/finances/tarifs" element={<TarifsEcolagePage />} />
            <Route path="/finances/factures" element={<FacturesListPage />} />
            <Route path="/finances/impayes-tranches" element={<ImpayesTranchePage />} />
            <Route path="/finances/inscriptions" element={<InscriptionsPage />} />
            <Route path="/finances/paiement-assurance" element={<PaiementEleveTypePage key="assurance" type="ASSURANCE" />} />
            <Route path="/finances/paiement-formations" element={<PaiementEleveTypePage key="formations" type="FORMATION" />} />
            <Route path="/finances/bordereau" element={<BordereauJournalierPage />} />
            <Route path="/finances/budget" element={<ReserveAuFondateur><BudgetTresoreriePage /></ReserveAuFondateur>} />
            <Route path="/finances/cloture" element={<ClotureAnneePage />} />
            <Route
              path="/finances/assurance"
              element={MODULES_DESACTIVES.assurance ? <Navigate to="/finances/paiement-assurance" replace /> : <AssurancePage />}
            />
            <Route path="/absences/appel" element={<AppelDuJourPage />} />
            <Route path="/absences/historique" element={<AbsencesHistoriquePage />} />
            <Route path="/personnel" element={<PersonnelListPage />} />
            <Route path="/personnel/nouveau" element={<PersonnelFormPage />} />
            <Route path="/personnel/:id" element={<PersonnelDetailPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/matieres" element={<MatieresPage />} />
            <Route path="/parcours" element={<ParcoursPage />} />
            <Route path="/emploi-du-temps" element={<EmploiDuTempsPage />} />
            <Route path="/communication" element={<CommunicationPage />} />
            <Route
              path="/admissions"
              element={MODULES_DESACTIVES.admissions ? <Navigate to="/eleves" replace /> : <AdmissionsPage />}
            />
            <Route path="/paie" element={<PaiePage />} />
            <Route path="/logistique" element={<LogistiquePage />} />
            <Route path="/bibliotheque" element={<BibliothequePage />} />
            <Route path="/utilisateurs" element={<UtilisateursPage />} />
            <Route
              path="/finance"
              element={MODULES_DESACTIVES.bilanFinancier ? <Navigate to="/dashboard" replace /> : <FinancePage />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Budget et trésorerie : fondateur seulement (le serveur refuse aussi les autres rôles). Adresse ouverte par un
// autre rôle : retour au tableau de bord.
function ReserveAuFondateur({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'FONDATEUR' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default App;
