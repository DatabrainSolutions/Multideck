using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceIntegrationEvent
{
    public Guid TceeventId { get; set; }

    public string TceeventStatusCode { get; set; } = null!;

    public string TceeventTouchpointTypeCode { get; set; } = null!;

    public Guid? TceeventPolicyId { get; set; }

    public Guid? TceeventJobId { get; set; }

    public Guid? TceeventCustomerOrgId { get; set; }

    public Guid? TceeventOrgOfficeId { get; set; }

    public Guid? TceeventLegalEntityId { get; set; }

    public Guid? TceeventBrandId { get; set; }

    public string? TceeventSourceRecordTypeCode { get; set; }

    public string? TceeventSourceTable { get; set; }

    public Guid? TceeventSourceId { get; set; }

    public string? TceeventEventKey { get; set; }

    public string TceeventPayloadJson { get; set; } = null!;

    public string? TceeventProcessingNotes { get; set; }

    public int TceeventRetryCount { get; set; }

    public DateTime? TceeventNextAttemptAt { get; set; }

    public DateTime? TceeventProcessedAt { get; set; }

    public DateTime TceeventCreatedAt { get; set; }

    public Guid? TceeventCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual CmpBrand? TceeventBrand { get; set; }

    public virtual CmpUser? TceeventCreatedByNavigation { get; set; }

    public virtual OrgMaster? TceeventCustomerOrg { get; set; }

    public virtual JobHeader? TceeventJob { get; set; }

    public virtual CmpLegalEntity? TceeventLegalEntity { get; set; }

    public virtual CmpOffice? TceeventOrgOffice { get; set; }

    public virtual TceScreeningPolicy? TceeventPolicy { get; set; }

    public virtual SysWorkflowRecordType? TceeventSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTceeventStatus TceeventStatusCodeNavigation { get; set; } = null!;

    public virtual SysTcetouchpointType TceeventTouchpointTypeCodeNavigation { get; set; } = null!;
}
