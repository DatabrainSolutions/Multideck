using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionLayoutRow
{
    public Guid DocbslrId { get; set; }

    public Guid DocbslrSectionVersionId { get; set; }

    public int DocbslrRowNo { get; set; }

    public string DocbslrRowType { get; set; } = null!;

    public decimal? DocbslrMinHeightMm { get; set; }

    public decimal? DocbslrMaxHeightMm { get; set; }

    public bool DocbslrKeepTogether { get; set; }

    public bool DocbslrPageBreakBefore { get; set; }

    public bool DocbslrPageBreakAfter { get; set; }

    public string DocbslrRepeatMode { get; set; } = null!;

    public string DocbslrStyleJson { get; set; } = null!;

    public string DocbslrConditionJson { get; set; } = null!;

    public DateTime DocbslrCreatedAt { get; set; }

    public Guid? DocbslrCreatedBy { get; set; }

    public virtual ICollection<DocbSectionLayoutCell> DocbSectionLayoutCells { get; set; } = new List<DocbSectionLayoutCell>();

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual CmpUser? DocbslrCreatedByNavigation { get; set; }

    public virtual DocbSectionVersion DocbslrSectionVersion { get; set; } = null!;
}
