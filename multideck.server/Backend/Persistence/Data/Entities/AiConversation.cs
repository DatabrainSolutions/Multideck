using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiConversation
{
    public Guid AicnvId { get; set; }

    public string? AicnvTitle { get; set; }

    public string AicnvChannel { get; set; } = null!;

    public string? AicnvDomainCode { get; set; }

    public Guid? AicnvCompanyId { get; set; }

    public Guid? AicnvOrgOfficeId { get; set; }

    public Guid? AicnvLegalEntityId { get; set; }

    public Guid? AicnvBrandId { get; set; }

    public Guid? AicnvOwnerUserId { get; set; }

    public string? AicnvTargetTable { get; set; }

    public Guid? AicnvTargetId { get; set; }

    public string AicnvStatus { get; set; } = null!;

    public string AicnvSecurityClass { get; set; } = null!;

    public bool AicnvIsTrainingAllowed { get; set; }

    public DateOnly? AicnvRetentionUntil { get; set; }

    public string? AicnvSummaryText { get; set; }

    public string AicnvMetadataJson { get; set; } = null!;

    public DateTime AicnvStartedAt { get; set; }

    public DateTime? AicnvEndedAt { get; set; }

    public DateTime AicnvCreatedAt { get; set; }

    public Guid? AicnvCreatedBy { get; set; }

    public DateTime AicnvUpdatedAt { get; set; }

    public Guid? AicnvUpdatedBy { get; set; }

    public virtual ICollection<AiConversationParticipant> AiConversationParticipants { get; set; } = new List<AiConversationParticipant>();

    public virtual ICollection<AiMessage> AiMessages { get; set; } = new List<AiMessage>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();

    public virtual CmpBrand? AicnvBrand { get; set; }

    public virtual SysAiconversationChannel AicnvChannelNavigation { get; set; } = null!;

    public virtual CmpCompany? AicnvCompany { get; set; }

    public virtual SysAicontextDomain? AicnvDomainCodeNavigation { get; set; }

    public virtual CmpLegalEntity? AicnvLegalEntity { get; set; }

    public virtual CmpOffice? AicnvOrgOffice { get; set; }

    public virtual CmpUser? AicnvOwnerUser { get; set; }
}
