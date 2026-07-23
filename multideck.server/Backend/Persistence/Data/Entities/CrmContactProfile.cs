using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmContactProfile
{
    public Guid CrmcontactId { get; set; }

    public Guid CrmcontactOrgContactId { get; set; }

    public Guid? CrmcontactAccountId { get; set; }

    public string? CrmcontactRoleCode { get; set; }

    public string? CrmcontactInfluenceLevel { get; set; }

    public decimal? CrmcontactRelationshipStrength { get; set; }

    public string? CrmcontactPreferredChannelCode { get; set; }

    public string? CrmcontactPreferredLanguageCode { get; set; }

    public bool CrmcontactConsentSalesContact { get; set; }

    public bool CrmcontactConsentMarketing { get; set; }

    public DateTime? CrmcontactLastContactAt { get; set; }

    public string? CrmcontactNotes { get; set; }

    public bool CrmcontactIsTrainingAllowed { get; set; }

    public string CrmcontactMetadataJson { get; set; } = null!;

    public DateTime CrmcontactCreatedAt { get; set; }

    public Guid? CrmcontactCreatedBy { get; set; }

    public DateTime CrmcontactUpdatedAt { get; set; }

    public Guid? CrmcontactUpdatedBy { get; set; }

    public virtual CrmAccountProfile? CrmcontactAccount { get; set; }

    public virtual CmpUser? CrmcontactCreatedByNavigation { get; set; }

    public virtual OrgContact CrmcontactOrgContact { get; set; } = null!;

    public virtual CmpUser? CrmcontactUpdatedByNavigation { get; set; }
}
