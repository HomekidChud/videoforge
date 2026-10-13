import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import PlatformPage from "@/pages/platform";
import SharePage from "@/pages/share";
import EditorPage from "@/pages/editor";
import ApiDocsPage from "@/pages/api-docs";
import ApiKeyPage from "@/pages/api-key";
import { LiveListPage, LiveWatchPage } from "@/pages/live";
import { useApiKey, ApiKeyProvider, setKeyChangeNotifier } from "@/lib/apiKey";
import { invalidateMediaTokens } from "@/lib/mediaUrl";

// Clear the query cache + media tokens when the API key changes (sign-in / sign-out).
setKeyChangeNotifier(() => {
  invalidateMediaTokens();
  queryClient.clear();
});

// ---------------------------------------------------------------------------
// Route gate: the editor and api-docs pages require a stored API key.
// The api-key page itself is exempt.
// ---------------------------------------------------------------------------

function RequireApiKey({ children }: { children: React.ReactNode }) {
  const { apiKey } = useApiKey();
  if (!apiKey) return <Redirect to="/api-key" />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/share/:id" component={SharePage} />
      <Route path="/platform">{() => <RequireApiKey><PlatformPage /></RequireApiKey>}</Route>
      <Route path="/live/:id">{(params) => <RequireApiKey><LiveWatchPage params={params as { id: string }} /></RequireApiKey>}</Route>
      <Route path="/live">{() => <RequireApiKey><LiveListPage /></RequireApiKey>}</Route>
      <Route path="/api-key" component={ApiKeyPage} />
      <Route path="/api-docs" component={ApiDocsPage} />
      <Route path="/">
        {() => (
          <RequireApiKey>
            <EditorPage />
          </RequireApiKey>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ApiKeyProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </ApiKeyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
