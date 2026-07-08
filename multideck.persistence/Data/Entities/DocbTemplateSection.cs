using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateSection
{
    public Guid DocbtsId { get; set; }

    public Guid DocbtsTemplateVersionId { get; set; }

    public Guid DocbtsSectionId { get; set; }

    public Guid? DocbtsSectionVersionId { get; set; }

    public int DocbtsSortOrder { get; set; }

    public string? DocbtsDisplayTitle { get; set; }

    public bool DocbtsIsRequired { get; set; }

    public bool DocbtsIsVisibleByDefault { get; set; }

    public bool DocbtsPageBreakBefore { get; set; }

    public bool DocbtsPageBreakAfter { get; set; }

    public string DocbtsConfigOverrideJson { get; set; } = null!;

    public string DocbtsConditionJson { get; set; } = null!;

    public string DocbtsBindingJson { get; set; } = null!;

    public virtual ICollection<DocbTemplateClauseLink> DocbTemplateClauseLinks { get; set; } = new List<DocbTemplateClauseLink>();

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();

    public virtual DocbSectionDefinition DocbtsSection { get; set; } = null!;

    public virtual DocbSectionVersion? DocbtsSectionVersion { get; set; }

    public virtual DocbTemplateVersion DocbtsTemplateVersion { get; set; } = null!;
}
