import get from 'lodash/get';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class AggregateByField implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Aggregate By Field',
		name: 'aggregateByField',
		icon: 'file:aggregateByField.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["fieldToGroupBy"]}}',
		description: 'Aggregate/group input items by a specified field value',
		defaults: {
			name: 'Aggregate By Field',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Field To Group By',
				name: 'fieldToGroupBy',
				type: 'string',
				default: '',
				required: true,
				// eslint-disable-next-line n8n-nodes-base/node-param-placeholder-miscased-id
				placeholder: 'e.g. Category',
				description: 'The name of the field to group the input items by. Items with the same value in this field will be grouped together.',
				hint: 'Enter the field name as text. Use dot notation for nested fields (e.g. "address.city")',
				requiresDataPath: 'single',
			},
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'items',
				description: 'The name of the field in the output that will contain the array of grouped items',
			},
			{
				displayName: 'Include Group Key In Output',
				name: 'includeGroupKey',
				type: 'boolean',
				default: true,
				description: 'Whether to include the grouping field and its value in each output item',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Disable Dot Notation',
						name: 'disableDotNotation',
						type: 'boolean',
						default: false,
						description: 'Whether to disallow referencing child fields using `parent.child` in the field name',
					},
					{
						displayName: 'Handle Missing Values',
						name: 'handleMissingValues',
						type: 'options',
						default: 'skip',
						description: 'How to handle items where the grouping field is missing or undefined',
						options: [
							{
								name: 'Skip Item',
								value: 'skip',
								description: 'Skip items that do not have the grouping field',
							},
							{
								name: 'Group as "undefined"',
								value: 'groupUndefined',
								description: 'Group items without the field under a key called "undefined"',
							},
							{
								name: 'Group as "null"',
								value: 'groupNull',
								description: 'Group items without the field under a key called "null"',
							},
							{
								name: 'Group as Empty String',
								value: 'groupEmpty',
								description: 'Group items without the field under an empty string key',
							},
						],
					},
					{
						displayName: 'Sort Groups',
						name: 'sortGroups',
						type: 'options',
						default: 'none',
						description: 'How to sort the output groups',
						options: [
							{
								name: 'No Sorting',
								value: 'none',
								description: 'Keep groups in the order they were first encountered',
							},
							{
								name: 'Ascending',
								value: 'asc',
								description: 'Sort groups alphabetically (A-Z)',
							},
							{
								name: 'Descending',
								value: 'desc',
								description: 'Sort groups reverse alphabetically (Z-A)',
							},
						],
					},
					{
						displayName: 'Include Item Count',
						name: 'includeItemCount',
						type: 'boolean',
						default: false,
						description: 'Whether to include a count of items in each group',
					},
					{
						displayName: 'Item Count Field Name',
						name: 'itemCountFieldName',
						type: 'string',
						default: 'itemCount',
						description: 'The field name for the item count',
						displayOptions: {
							show: {
								includeItemCount: [true],
							},
						},
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// Handle empty input
		if (items.length === 0) {
			return [[]];
		}

		// Get parameters
		const fieldToGroupBy = (this.getNodeParameter('fieldToGroupBy', 0) as string).trim();
		const outputFieldName = this.getNodeParameter('outputFieldName', 0) as string;
		const includeGroupKey = this.getNodeParameter('includeGroupKey', 0) as boolean;
		const options = this.getNodeParameter('options', 0) as IDataObject;

		const disableDotNotation = (options.disableDotNotation as boolean) || false;
		const handleMissingValues = (options.handleMissingValues as string) || 'skip';
		const sortGroups = (options.sortGroups as string) || 'none';
		const includeItemCount = (options.includeItemCount as boolean) || false;
		const itemCountFieldName = (options.itemCountFieldName as string) || 'itemCount';

		if (!fieldToGroupBy) {
			throw new NodeOperationError(
				this.getNode(),
				'No field specified',
				{ description: 'Please specify a field to group by' },
			);
		}

		// Track if field was found in any item (for helpful hints)
		const fieldFoundInItems: boolean[] = [];

		// Group the items
		const grouped: Map<string, IDataObject[]> = new Map();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const item = items[itemIndex];
			let groupKey: unknown;

			// Get the field value using lodash get (like Aggregate node does)
			if (!disableDotNotation) {
				groupKey = get(item.json, fieldToGroupBy);
			} else {
				groupKey = item.json[fieldToGroupBy];
			}

			// Track whether field was found
			fieldFoundInItems.push(groupKey !== undefined);

			// Handle missing/undefined values
			if (groupKey === undefined || groupKey === null) {
				switch (handleMissingValues) {
					case 'skip':
						continue;
					case 'groupUndefined':
						groupKey = 'undefined';
						break;
					case 'groupNull':
						groupKey = 'null';
						break;
					case 'groupEmpty':
						groupKey = '';
						break;
				}
			}

			// Convert to string for consistent grouping
			const keyString = String(groupKey);

			if (!grouped.has(keyString)) {
				grouped.set(keyString, []);
			}

			grouped.get(keyString)!.push(item.json);
		}

		// Add execution hint if field wasn't found in any items
		if (fieldFoundInItems.every((found) => !found)) {
			this.addExecutionHints({
				message: `The field '${fieldToGroupBy}' wasn't found in any input item`,
				location: 'outputPane',
			});
		}

		// If all items were skipped and no groups created, return empty
		if (grouped.size === 0) {
			return [[]];
		}

		// Get group keys and optionally sort them
		let groupKeys = Array.from(grouped.keys());

		if (sortGroups === 'asc') {
			groupKeys.sort((a, b) => a.localeCompare(b));
		} else if (sortGroups === 'desc') {
			groupKeys.sort((a, b) => b.localeCompare(a));
		}

		// Build output items
		const outputItems: INodeExecutionData[] = groupKeys.map((key) => {
			const groupItems = grouped.get(key)!;
			const outputJson: IDataObject = {};

			if (includeGroupKey) {
				// Handle nested field names - use the last part as the key name
				// e.g., "user.address.city" becomes "city"
				const getOutputKeyName = () =>
					!disableDotNotation && fieldToGroupBy.includes('.')
						? fieldToGroupBy.split('.').pop()!
						: fieldToGroupBy;
						
				outputJson[getOutputKeyName()] = key;
			}

			outputJson[outputFieldName] = groupItems;

			if (includeItemCount) {
				outputJson[itemCountFieldName] = groupItems.length;
			}

			return {
				json: outputJson,
				pairedItem: Array.from({ length: groupItems.length }, (_, i) => ({ item: i })),
			};
		});

		return [outputItems];
	}
}
