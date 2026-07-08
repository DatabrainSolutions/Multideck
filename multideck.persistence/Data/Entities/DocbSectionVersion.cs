using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionVersion
{
    public Guid DocbsvId { get; set; }

    public Guid DocbsvSectionId { get; set; }

    public int DocbsvVersionNo { get; set; }

    public string DocbsvStatusCode { get; set; } = null!;

    public string DocbsvContentJson { get; set; } = null!;

    public string DocbsvConfigJson { get; set; } = null!;

    public string DocbsvConditionJson { get; set; } = null!;

    public string? DocbsvChangeReason { get; set; }

    public DateTime? DocbsvPublishedAt { get; set; }

    public Guid? DocbsvPublishedBy { get; set; }

    public DateTime DocbsvCreatedAt { get; set; }

    public Guid? DocbsvCreatedBy { get; set; }

    public virtual ICollection<DocbSectionLayoutRow> DocbSectionLayoutRows { get; set; } = new List<DocbSectionLayoutRow>();

    public virtual ICollection<DocbTemplateSection> DocbTemplateSections { get; set; } = new List<DocbTemplateSection>();

    public virtual CmpUser? DocbsvCreatedByNavigation { get; set; }

    public virtual CmpUser? DocbsvPublishedByNavigation { get; set; }

    public virtual DocbSectionDefinition DocbsvSection { get; set; } = null!;

    public virtual SysDocBuilderStatus DocbsvStatusCodeNavigation { get; set; } = null!;
}
