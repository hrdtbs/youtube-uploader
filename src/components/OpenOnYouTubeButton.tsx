import { Button } from "@mantine/core";
import { openVideoOnYouTube } from "../lib/youtube";

interface Props {
  videoId: string;
  title: string;
}

export default function OpenOnYouTubeButton({ videoId, title }: Props) {
  return (
    <Button
      variant="light"
      color="red"
      size="xs"
      onClick={() => void openVideoOnYouTube(videoId)}
      aria-label={`${title} を YouTube で開く`}
    >
      YouTubeで開く
    </Button>
  );
}
