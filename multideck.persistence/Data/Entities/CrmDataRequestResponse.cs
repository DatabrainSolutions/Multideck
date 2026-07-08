using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataRequestResponse
{
    public Guid CrmdataReqRespId { get; set; }

    public Guid CrmdataReqRespRequestId { get; set; }

    public string CrmdataReqRespMethodCode { get; set; } = null!;

    public Guid? CrmdataReqRespCommMessageId { get; set; }

    public Guid? CrmdataReqRespCommCallId { get; set; }

    public Guid? CrmdataReqRespPortalActionId { get; set; }

    public string? CrmdataReqRespRawText { get; set; }

    public string CrmdataReqRespRawJson { get; set; } = null!;

    public Guid? CrmdataReqRespAitaskRunId { get; set; }

    public decimal? CrmdataReqRespConfidenceScore { get; set; }

    public DateTime CrmdataReqRespReceivedAt { get; set; }

    public Guid? CrmdataReqRespCreatedBy { get; set; }

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual AiTaskRun? CrmdataReqRespAitaskRun { get; set; }

    public virtual CommCallLog? CrmdataReqRespCommCall { get; set; }

    public virtual CommMessage? CrmdataReqRespCommMessage { get; set; }

    public virtual CmpUser? CrmdataReqRespCreatedByNavigation { get; set; }

    public virtual SysCrmdataCaptureMethod CrmdataReqRespMethodCodeNavigation { get; set; } = null!;

    public virtual CrmDataRequest CrmdataReqRespRequest { get; set; } = null!;
}
