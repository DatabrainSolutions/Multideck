using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmSetting
{
    public Guid CrmsettingsId { get; set; }

    public Guid? CrmsettingsOrgOfficeId { get; set; }

    public Guid? CrmsettingsLegalEntityId { get; set; }

    public Guid? CrmsettingsBrandId { get; set; }

    public Guid? CrmsettingsDefaultLeadOwnerUserId { get; set; }

    public int CrmsettingsDefaultQuoteFollowupHours { get; set; }

    public int CrmsettingsDefaultLeadResponseMinutes { get; set; }

    public bool CrmsettingsAutoCreateQuoteFollowup { get; set; }

    public bool CrmsettingsAutoCreatePostCallReview { get; set; }

    public bool CrmsettingsAutoCreateOnboardingOnFirstWin { get; set; }

    public bool CrmsettingsAitrainingDefaultAllowed { get; set; }

    public string CrmsettingsSettingsJson { get; set; } = null!;

    public DateTime CrmsettingsCreatedAt { get; set; }

    public Guid? CrmsettingsCreatedBy { get; set; }

    public DateTime CrmsettingsUpdatedAt { get; set; }

    public Guid? CrmsettingsUpdatedBy { get; set; }

    public virtual CmpBrand? CrmsettingsBrand { get; set; }

    public virtual CmpUser? CrmsettingsCreatedByNavigation { get; set; }

    public virtual CmpUser? CrmsettingsDefaultLeadOwnerUser { get; set; }

    public virtual CmpLegalEntity? CrmsettingsLegalEntity { get; set; }

    public virtual CmpOffice? CrmsettingsOrgOffice { get; set; }

    public virtual CmpUser? CrmsettingsUpdatedByNavigation { get; set; }
}
