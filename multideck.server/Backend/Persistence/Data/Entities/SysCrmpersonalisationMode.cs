using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmpersonalisationMode
{
    public string CrmpersModeCode { get; set; } = null!;

    public string CrmpersModeName { get; set; } = null!;

    public string? CrmpersModeDescription { get; set; }

    public bool CrmpersModeIsTemplateBased { get; set; }

    public bool CrmpersModeRequiresAi { get; set; }

    public bool CrmpersModeIsActive { get; set; }

    public int CrmpersModeSortOrder { get; set; }

    public virtual ICollection<CrmPersonalMessageDraft> CrmPersonalMessageDrafts { get; set; } = new List<CrmPersonalMessageDraft>();
}
