using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmInboundReplyMatch
{
    public Guid CrmreplyMatchId { get; set; }

    public Guid CrmreplyMatchDataRequestId { get; set; }

    public Guid? CrmreplyMatchResponseId { get; set; }

    public Guid? CrmreplyMatchCommThreadId { get; set; }

    public Guid? CrmreplyMatchCommMessageId { get; set; }

    public Guid? CrmreplyMatchCommCallId { get; set; }

    public decimal CrmreplyMatchMatchScore { get; set; }

    public string? CrmreplyMatchMatchReason { get; set; }

    public bool CrmreplyMatchIsConfirmed { get; set; }

    public DateTime CrmreplyMatchCreatedAt { get; set; }

    public DateTime? CrmreplyMatchConfirmedAt { get; set; }

    public Guid? CrmreplyMatchConfirmedBy { get; set; }

    public virtual CommCallLog? CrmreplyMatchCommCall { get; set; }

    public virtual CommMessage? CrmreplyMatchCommMessage { get; set; }

    public virtual CommThread? CrmreplyMatchCommThread { get; set; }

    public virtual CmpUser? CrmreplyMatchConfirmedByNavigation { get; set; }

    public virtual CrmDataRequest CrmreplyMatchDataRequest { get; set; } = null!;

    public virtual CrmDataRequestResponse? CrmreplyMatchResponse { get; set; }
}
