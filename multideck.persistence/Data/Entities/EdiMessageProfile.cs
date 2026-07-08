using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMessageProfile
{
    public Guid EdimpId { get; set; }

    public Guid EdimpTradingPartnerId { get; set; }

    public Guid? EdimpConnectionId { get; set; }

    public string EdimpCode { get; set; } = null!;

    public string EdimpName { get; set; } = null!;

    public string EdimpMessageTypeCode { get; set; } = null!;

    public string EdimpDirectionCode { get; set; } = null!;

    public string EdimpStandardCode { get; set; } = null!;

    public string? EdimpStandardVersion { get; set; }

    public string? EdimpAgencyCode { get; set; }

    public string? EdimpTargetRecordTypeCode { get; set; }

    public string? EdimpTargetTable { get; set; }

    public bool EdimpRequiresAcknowledgement { get; set; }

    public string? EdimpAcknowledgementTypeCode { get; set; }

    public int? EdimpAcknowledgementDueMinutes { get; set; }

    public bool EdimpAutoProcessInbound { get; set; }

    public bool EdimpAutoSendOutbound { get; set; }

    public string EdimpValidationRulesJson { get; set; } = null!;

    public bool EdimpIsActive { get; set; }

    public DateTime EdimpCreatedAt { get; set; }

    public Guid? EdimpCreatedBy { get; set; }

    public virtual ICollection<EdiCertification> EdiCertifications { get; set; } = new List<EdiCertification>();

    public virtual ICollection<EdiMappingProfile> EdiMappingProfiles { get; set; } = new List<EdiMappingProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiOutboundQueue> EdiOutboundQueues { get; set; } = new List<EdiOutboundQueue>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual SysEdiacknowledgementType? EdimpAcknowledgementTypeCodeNavigation { get; set; }

    public virtual EdiConnection? EdimpConnection { get; set; }

    public virtual CmpUser? EdimpCreatedByNavigation { get; set; }

    public virtual SysEdidirection EdimpDirectionCodeNavigation { get; set; } = null!;

    public virtual SysEdimessageType EdimpMessageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdistandard EdimpStandardCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? EdimpTargetRecordTypeCodeNavigation { get; set; }

    public virtual EdiTradingPartner EdimpTradingPartner { get; set; } = null!;
}
