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
import HomePage from "@/pages/home";
import { PublicThemeProvider } from "@/components/forge-public";
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
// Studio and administrative pages require a session API key.
// The homepage, docs, share pages and sign-in remain public.
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
      <Route path="/api-docs">{()=> <ApiDocsPage/>}</Route>
      {/* #/docs and #/docs/ land on the introduction instead of a 404. */}
      <Route path="/docs">{() => <Redirect to="/docs/introduction" />}</Route>
      <Route path="/docs/">{() => <Redirect to="/docs/introduction" />}</Route>
      <Route path="/docs/:slug">{params=><ApiDocsPage params={params as {slug:string}}/>}</Route>
      <Route path="/" component={HomePage} />
      <Route path="/editor">
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
            <PublicThemeProvider><AppRouter /></PublicThemeProvider>
          </Router>
        </ApiKeyProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
