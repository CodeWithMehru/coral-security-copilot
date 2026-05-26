import { TopBar } from "@/components/layout/TopBar";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default function AgentChatPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar
        title="Agent Chat"
        subtitle="Natural language to Coral SQL — GitHub, Slack, Notion, OSV sources"
      />
      <div className="min-h-0 flex-1">
        <ChatInterface />
      </div>
    </div>
  );
}
