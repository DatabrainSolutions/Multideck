using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmfeedbackCategory
{
    public string CrmfeedbackCategoryCode { get; set; } = null!;

    public string CrmfeedbackCategoryName { get; set; } = null!;

    public string? CrmfeedbackCategoryDescription { get; set; }

    public bool CrmfeedbackCategoryIsControllable { get; set; }

    public bool CrmfeedbackCategoryIsActive { get; set; }

    public int CrmfeedbackCategorySortOrder { get; set; }

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmMarketFeedbackTheme> CrmMarketFeedbackThemes { get; set; } = new List<CrmMarketFeedbackTheme>();
}
