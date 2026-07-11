import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function EmptyStateCard({
  title,
  message,
  suggestedAction,
}: {
  title: string;
  message: string;
  suggestedAction?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{message}</p>
        {suggestedAction && <p className="text-xs italic">{suggestedAction}</p>}
      </CardContent>
    </Card>
  );
}
