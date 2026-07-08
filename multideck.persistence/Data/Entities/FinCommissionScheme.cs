using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionScheme
{
    public Guid FincommSchemeId { get; set; }

    public string FincommSchemeCode { get; set; } = null!;

    public string FincommSchemeName { get; set; } = null!;

    public Guid? FincommSchemeUserId { get; set; }

    public Guid? FincommSchemeOrgOfficeId { get; set; }

    public string FincommSchemeBasisCode { get; set; } = null!;

    public DateOnly FincommSchemeEffectiveFrom { get; set; }

    public DateOnly? FincommSchemeEffectiveTo { get; set; }

    public bool FincommSchemeIsActive { get; set; }

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual ICollection<FinCommissionRule> FinCommissionRules { get; set; } = new List<FinCommissionRule>();

    public virtual SysFinanceCommissionBasis FincommSchemeBasisCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? FincommSchemeOrgOffice { get; set; }

    public virtual CmpUser? FincommSchemeUser { get; set; }
}
