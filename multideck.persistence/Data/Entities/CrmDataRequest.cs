using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataRequest
{
    public Guid CrmdataReqId { get; set; }

    public Guid? CrmdataReqRunId { get; set; }

    public Guid? CrmdataReqQuickTaskId { get; set; }

    public string CrmdataReqStatusCode { get; set; } = null!;

    public string CrmdataReqMethodCode { get; set; } = null!;

    public string? CrmdataReqChannelCode { get; set; }

    public Guid? CrmdataReqCustomerOrgId { get; set; }

    public Guid? CrmdataReqContactId { get; set; }

    public Guid? CrmdataReqAssignedUserId { get; set; }

    public Guid? CrmdataReqCommSendId { get; set; }

    public string? CrmdataReqSubject { get; set; }

    public string CrmdataReqRequestText { get; set; } = null!;

    public DateTime? CrmdataReqDueAt { get; set; }

    public DateTime? CrmdataReqSentAt { get; set; }

    public DateTime? CrmdataReqReceivedAt { get; set; }

    public string CrmdataReqMetadataJson { get; set; } = null!;

    public DateTime CrmdataReqCreatedAt { get; set; }

    public Guid? CrmdataReqCreatedBy { get; set; }

    public virtual ICollection<CrmDataRequestField> CrmDataRequestFields { get; set; } = new List<CrmDataRequestField>();

    public virtual ICollection<CrmDataRequestResponse> CrmDataRequestResponses { get; set; } = new List<CrmDataRequestResponse>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual CmpUser? CrmdataReqAssignedUser { get; set; }

    public virtual SysCommChannel? CrmdataReqChannelCodeNavigation { get; set; }

    public virtual CommSendRequest? CrmdataReqCommSend { get; set; }

    public virtual OrgContact? CrmdataReqContact { get; set; }

    public virtual CmpUser? CrmdataReqCreatedByNavigation { get; set; }

    public virtual OrgMaster? CrmdataReqCustomerOrg { get; set; }

    public virtual SysCrmdataCaptureMethod CrmdataReqMethodCodeNavigation { get; set; } = null!;

    public virtual CrmQuickTask? CrmdataReqQuickTask { get; set; }

    public virtual CrmAutomationRun? CrmdataReqRun { get; set; }

    public virtual SysCrmdataRequestStatus CrmdataReqStatusCodeNavigation { get; set; } = null!;
}
