import { HiSparkles } from 'react-icons/hi2';

function AiGuide({ aiMessage, aiLoading }) {
  return (
    <div className="ai-guide">
      <div className="ai-guide-header">
        <span className="ai-guide-badge">
          <HiSparkles size={15} />
          AI 안심 가이드
        </span>
      </div>

      {aiLoading ? (
        <div className="ai-guide-loading">
          경로를 분석하는 중
          <span className="ai-dots"><span /><span /><span /></span>
        </div>
      ) : (
        <p className="ai-guide-text">{aiMessage}</p>
      )}
    </div>
  );
}

export default AiGuide;
